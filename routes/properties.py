
from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity, get_jwt
from utils.database import execute_query

properties_bp = Blueprint('properties', __name__)

@properties_bp.route('/', methods=['GET'])
def get_properties():
    try:
        # Filtreleme parametreleri
        city = request.args.get('city')
        min_price = request.args.get('minPrice')
        max_price = request.args.get('maxPrice')
        max_guests = request.args.get('maxGuests')
        page = int(request.args.get('page', 1))
        limit = int(request.args.get('limit', 10))
        
        # Base query
        query = """
        SELECT p.*, u.first_name as owner_first_name, u.last_name as owner_last_name,
               COALESCE(AVG(r.rating), 0) as average_rating,
               COUNT(r.review_id) as review_count
        FROM properties p
        LEFT JOIN users u ON p.owner_id = u.user_id
        LEFT JOIN reviews r ON p.property_id = r.property_id
        WHERE p.is_active = 1
        """
        
        params = []
        
        # Filtreleri uygula
        if city:
            query += " AND p.city LIKE %s"
            params.append(f"%{city}%")
        
        if min_price:
            query += " AND p.price_per_night >= %s"
            params.append(float(min_price))
        
        if max_price:
            query += " AND p.price_per_night <= %s"
            params.append(float(max_price))
        
        if max_guests:
            query += " AND p.max_guests >= %s"
            params.append(int(max_guests))
        
        query += " GROUP BY p.property_id"
        
        # Pagination
        offset = (page - 1) * limit
        query += " LIMIT %s OFFSET %s"
        params.extend([limit, offset])
        
        properties = execute_query(query, params)
        
        # Her mülk için resimlerini al
        for property in properties:
            try:
                images = execute_query(
                    "SELECT image_url, is_primary FROM property_images WHERE property_id = %s ORDER BY image_order",
                    (property['property_id'],)
                )
                property['images'] = images or []
            except:
                property['images'] = []
        
        return jsonify({
            'properties': properties,
            'pagination': {
                'page': page,
                'limit': limit,
                'hasMore': len(properties) == limit
            }
        })
        
    except Exception as e:
        return jsonify({'message': 'Failed to fetch properties', 'error': str(e)}), 500

@properties_bp.route('/<int:property_id>', methods=['GET'])
def get_property(property_id):
    try:
        property = execute_query(
            """SELECT p.*, u.first_name as owner_first_name, u.last_name as owner_last_name,
                      u.email as owner_email, u.phone as owner_phone,
                      COALESCE(AVG(r.rating), 0) as average_rating,
                      COUNT(r.review_id) as review_count
               FROM properties p
               LEFT JOIN users u ON p.owner_id = u.user_id
               LEFT JOIN reviews r ON p.property_id = r.property_id
               WHERE p.property_id = %s AND p.is_active = 1
               GROUP BY p.property_id""",
            (property_id,), fetch_one=True
        )
        
        if not property:
            return jsonify({'message': 'Property not found'}), 404
        
        # Resimleri al
        try:
            images = execute_query(
                "SELECT image_url, is_primary FROM property_images WHERE property_id = %s ORDER BY image_order",
                (property_id,)
            )
            property['images'] = images or []
        except:
            property['images'] = []
        
        # Son yorumları al
        try:
            reviews = execute_query(
                """SELECT r.*, u.first_name, u.last_name
                   FROM reviews r
                   JOIN users u ON r.tenant_id = u.user_id
                   WHERE r.property_id = %s
                   ORDER BY r.review_date DESC
                   LIMIT 10""",
                (property_id,)
            )
            property['reviews'] = reviews or []
        except:
            property['reviews'] = []
        
        return jsonify({'property': property})
        
    except Exception as e:
        return jsonify({'message': 'Failed to fetch property', 'error': str(e)}), 500

@properties_bp.route('/', methods=['POST'])
@jwt_required()
def create_property():
    try:
        claims = get_jwt()
        if claims.get('role') != 'owner':
            return jsonify({'message': 'Only owners can create properties'}), 403
        
        data = request.get_json()
        
        # Gerekli alanları kontrol et
        required_fields = ['title', 'address', 'city', 'maxGuests', 'bedrooms', 'bathrooms', 'pricePerNight']
        for field in required_fields:
            if not data.get(field):
                return jsonify({'message': f'{field} is required'}), 400
        
        user_id = int(get_jwt_identity())
        
        # Mülkü oluştur
        result = execute_query(
            """INSERT INTO properties (
                owner_id, title, description, address, city, country, latitude, longitude,
                max_guests, bedrooms, bathrooms, price_per_night, cleaning_fee
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)""",
            (
                user_id, data['title'], data.get('description', ''), data['address'],
                data['city'], data.get('country', 'Turkey'), data.get('latitude'),
                data.get('longitude'), data['maxGuests'], data['bedrooms'],
                data['bathrooms'], data['pricePerNight'], data.get('cleaningFee', 0)
            )
        )
        
        return jsonify({
            'message': 'Property created successfully',
            'propertyId': result['last_insert_id']
        }), 201
        
    except Exception as e:
        return jsonify({'message': 'Failed to create property', 'error': str(e)}), 500

@properties_bp.route('/owner/my-properties', methods=['GET'])
@jwt_required()
def get_owner_properties():
    try:
        claims = get_jwt()
        if claims.get('role') != 'owner':
            return jsonify({'message': 'Owner access required'}), 403
        
        user_id = int(get_jwt_identity())
        
        # Get owner's properties with stats
        properties = execute_query(
            """SELECT p.*, 
                      COALESCE(COUNT(DISTINCT r.reservation_id), 0) as total_bookings,
                      COALESCE(SUM(CASE WHEN r.reservation_status = 'completed' THEN r.total_amount ELSE 0 END), 0) as total_revenue,
                      COALESCE(AVG(rev.rating), 0) as average_rating,
                      COUNT(DISTINCT rev.review_id) as review_count
               FROM properties p
               LEFT JOIN reservations r ON p.property_id = r.property_id
               LEFT JOIN reviews rev ON p.property_id = rev.property_id
               WHERE p.owner_id = %s
               GROUP BY p.property_id
               ORDER BY p.created_at DESC""",
            (user_id,)
        )
        
        return jsonify({
            'properties': properties,
            'total': len(properties)
        })
        
    except Exception as e:
        return jsonify({'message': 'Failed to fetch properties', 'error': str(e)}), 500

@properties_bp.route('/<int:property_id>', methods=['PUT'])
@jwt_required()
def update_property(property_id):
    try:
        claims = get_jwt()
        if claims.get('role') != 'owner':
            return jsonify({'message': 'Owner access required'}), 403
        
        user_id = int(get_jwt_identity())
        data = request.get_json()
        
        # Verify ownership
        property_check = execute_query(
            "SELECT owner_id FROM properties WHERE property_id = %s",
            (property_id,), fetch_one=True
        )
        
        if not property_check or property_check['owner_id'] != user_id:
            return jsonify({'message': 'Property not found or access denied'}), 404
        
        # Update property
        execute_query(
            """UPDATE properties SET 
                      title = %s, description = %s, address = %s, city = %s, 
                      price_per_night = %s, max_guests = %s, bedrooms = %s, 
                      bathrooms = %s, cleaning_fee = %s
               WHERE property_id = %s""",
            (data.get('title'), data.get('description'), data.get('address'),
             data.get('city'), data.get('pricePerNight'), data.get('maxGuests'),
             data.get('bedrooms'), data.get('bathrooms'), data.get('cleaningFee'),
             property_id)
        )
        
        return jsonify({'message': 'Property updated successfully'})
        
    except Exception as e:
        return jsonify({'message': 'Failed to update property', 'error': str(e)}), 500

@properties_bp.route('/<int:property_id>/toggle-status', methods=['PUT'])
@jwt_required()
def toggle_property_status(property_id):
    try:
        claims = get_jwt()
        if claims.get('role') not in ['owner', 'admin']:
            return jsonify({'message': 'Owner or admin access required'}), 403
        
        user_id = int(get_jwt_identity())
        data = request.get_json()
        is_active = data.get('is_active', True)
        
        # For owners, verify ownership
        if claims.get('role') == 'owner':
            property_check = execute_query(
                "SELECT owner_id FROM properties WHERE property_id = %s",
                (property_id,), fetch_one=True
            )
            
            if not property_check or property_check['owner_id'] != user_id:
                return jsonify({'message': 'Property not found or access denied'}), 404
        
        # Update status
        execute_query(
            "UPDATE properties SET is_active = %s WHERE property_id = %s",
            (is_active, property_id)
        )
        
        status = "activated" if is_active else "deactivated"
        return jsonify({'message': f'Property {status} successfully'})
        
    except Exception as e:
        return jsonify({'message': 'Failed to update property status', 'error': str(e)}), 500
