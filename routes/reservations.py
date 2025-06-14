
from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity, get_jwt
from utils.database import execute_query
from datetime import datetime

reservations_bp = Blueprint('reservations', __name__)

@reservations_bp.route('/', methods=['POST'])
@jwt_required()
def create_reservation():
    try:
        claims = get_jwt()
        if claims.get('role') != 'tenant':
            return jsonify({'message': 'Only tenants can make reservations'}), 403
        
        data = request.get_json()
        
        # Gerekli alanları kontrol et
        required_fields = ['propertyId', 'checkIn', 'checkOut', 'guests']
        for field in required_fields:
            if not data.get(field):
                return jsonify({'message': f'{field} is required'}), 400
        
        property_id = data['propertyId']
        check_in = data['checkIn']
        check_out = data['checkOut']
        guests = data['guests']
        user_id = int(get_jwt_identity())
        
        # Mülkün varlığını kontrol et
        property = execute_query(
            "SELECT property_id, max_guests, price_per_night, cleaning_fee, is_active FROM properties WHERE property_id = %s",
            (property_id,), fetch_one=True
        )
        
        if not property:
            return jsonify({'message': 'Property not found'}), 404
        
        if not property['is_active']:
            return jsonify({'message': 'Property is not available for booking'}), 400
        
        if guests > property['max_guests']:
            return jsonify({'message': f'Maximum {property["max_guests"]} guests allowed'}), 400
        
        # Müsaitlik kontrolü
        conflicts = execute_query(
            """SELECT COUNT(*) as conflict_count
               FROM reservations
               WHERE property_id = %s
               AND reservation_status IN ('confirmed', 'pending')
               AND (
                 (check_in_date <= %s AND check_out_date > %s) OR
                 (check_in_date < %s AND check_out_date >= %s) OR
                 (check_in_date >= %s AND check_out_date <= %s)
               )""",
            (property_id, check_in, check_in, check_out, check_out, check_in, check_out),
            fetch_one=True
        )
        
        if conflicts['conflict_count'] > 0:
            return jsonify({'message': 'Selected dates are not available'}), 400
        
        # Fiyat hesaplama
        check_in_date = datetime.fromisoformat(check_in.replace('Z', '+00:00'))
        check_out_date = datetime.fromisoformat(check_out.replace('Z', '+00:00'))
        total_nights = (check_out_date - check_in_date).days
        subtotal = total_nights * property['price_per_night']
        cleaning_fee = property['cleaning_fee'] or 0
        total_amount = subtotal + cleaning_fee
        
        # Rezervasyon oluştur
        result = execute_query(
            """INSERT INTO reservations (
                property_id, tenant_id, check_in_date, check_out_date, 
                guest_count, total_nights, price_per_night, cleaning_fee, total_amount
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)""",
            (property_id, user_id, check_in, check_out, guests, total_nights, 
             property['price_per_night'], cleaning_fee, total_amount)
        )
        
        return jsonify({
            'message': 'Reservation created successfully',
            'reservationId': result['last_insert_id'],
            'totalAmount': total_amount,
            'totalNights': total_nights
        }), 201
        
    except Exception as e:
        return jsonify({'message': 'Failed to create reservation', 'error': str(e)}), 500

@reservations_bp.route('/my-reservations', methods=['GET'])
@jwt_required()
def get_my_reservations():
    try:
        user_id = int(get_jwt_identity())
        status = request.args.get('status')
        limit = int(request.args.get('limit', 10))
        offset = int(request.args.get('offset', 0))
        
        query = """
        SELECT r.*, 
               p.title as property_title, p.address, p.city,
               p.price_per_night, p.cleaning_fee,
               u.first_name as owner_first_name, u.last_name as owner_last_name,
               u.email as owner_email, u.phone as owner_phone
        FROM reservations r
        JOIN properties p ON r.property_id = p.property_id
        JOIN users u ON p.owner_id = u.user_id
        WHERE r.tenant_id = %s
        """
        
        params = [user_id]
        
        if status:
            query += " AND r.reservation_status = %s"
            params.append(status)
        
        query += " ORDER BY r.booking_date DESC LIMIT %s OFFSET %s"
        params.extend([limit, offset])
        
        reservations = execute_query(query, params)
        
        return jsonify({
            'reservations': reservations,
            'pagination': {
                'limit': limit,
                'offset': offset,
                'hasMore': len(reservations) == limit
            }
        })
        
    except Exception as e:
        return jsonify({'message': 'Failed to fetch reservations', 'error': str(e)}), 500

# ===============================================
# NEW ENDPOINTS - ADD THESE TO THE END
# ===============================================

@reservations_bp.route('/owner', methods=['GET'])
@jwt_required()
def get_owner_reservations():
    try:
        claims = get_jwt()
        if claims.get('role') != 'owner':
            return jsonify({'message': 'Owner access required'}), 403
        
        user_id = int(get_jwt_identity())
        status = request.args.get('status')
        limit = int(request.args.get('limit', 50))
        offset = int(request.args.get('offset', 0))
        
        # Build query
        query = """
        SELECT r.*, 
               p.title as property_title, p.address, p.city,
               u.first_name as tenant_first_name, u.last_name as tenant_last_name,
               u.email as tenant_email, u.phone as tenant_phone
        FROM reservations r
        JOIN properties p ON r.property_id = p.property_id
        JOIN users u ON r.tenant_id = u.user_id
        WHERE p.owner_id = %s
        """
        
        params = [user_id]
        
        if status:
            query += " AND r.reservation_status = %s"
            params.append(status)
        
        query += " ORDER BY r.booking_date DESC LIMIT %s OFFSET %s"
        params.extend([limit, offset])
        
        reservations = execute_query(query, params)
        
        return jsonify({
            'reservations': reservations,
            'pagination': {
                'limit': limit,
                'offset': offset,
                'hasMore': len(reservations) == limit
            }
        })
        
    except Exception as e:
        return jsonify({'message': 'Failed to fetch reservations', 'error': str(e)}), 500

@reservations_bp.route('/<int:reservation_id>/status', methods=['PUT'])
@jwt_required()
def update_reservation_status(reservation_id):
    try:
        user_id = int(get_jwt_identity())
        claims = get_jwt()
        role = claims.get('role')
        data = request.get_json()
        
        new_status = data.get('status')
        reason = data.get('reason', '')
        
        if new_status not in ['pending', 'confirmed', 'completed', 'cancelled']:
            return jsonify({'message': 'Invalid status'}), 400
        
        # Get reservation details
        reservation = execute_query(
            """SELECT r.*, p.owner_id 
               FROM reservations r
               JOIN properties p ON r.property_id = p.property_id
               WHERE r.reservation_id = %s""",
            (reservation_id,), fetch_one=True
        )
        
        if not reservation:
            return jsonify({'message': 'Reservation not found'}), 404
        
        # Check permissions
        can_update = False
        if role == 'admin':
            can_update = True
        elif role == 'owner' and reservation['owner_id'] == user_id:
            can_update = True
        elif role == 'tenant' and reservation['tenant_id'] == user_id:
            # Tenants can only cancel their own reservations
            can_update = new_status == 'cancelled'
        
        if not can_update:
            return jsonify({'message': 'Access denied'}), 403
        
        # Update reservation status
        execute_query(
            """UPDATE reservations 
               SET reservation_status = %s, 
                   cancellation_reason = %s
               WHERE reservation_id = %s""",
            (new_status, reason if new_status == 'cancelled' else None, reservation_id)
        )
        
        return jsonify({
            'message': f'Reservation {new_status} successfully',
            'status': new_status
        })
        
    except Exception as e:
        return jsonify({'message': 'Failed to update reservation status', 'error': str(e)}), 500
