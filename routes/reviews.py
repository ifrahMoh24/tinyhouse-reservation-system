from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity, get_jwt
from utils.database import execute_query

reviews_bp = Blueprint('reviews', __name__)

@reviews_bp.route('/', methods=['POST'])
@jwt_required()
def create_review():
    try:
        claims = get_jwt()
        if claims.get('role') != 'tenant':
            return jsonify({'message': 'Only tenants can leave reviews'}), 403
        
        data = request.get_json()
        
        if not data.get('reservationId') or not data.get('rating') or not data.get('comment'):
            return jsonify({'message': 'Reservation ID, rating, and comment are required'}), 400
        
        reservation_id = data['reservationId']
        rating = data['rating']
        comment = data['comment']
        user_id = get_jwt_identity()
        
        # Rating 1-5 arasında olmalı
        if not 1 <= rating <= 5:
            return jsonify({'message': 'Rating must be between 1 and 5'}), 400
        
        # Rezervasyonun varlığını ve sahipliğini kontrol et
        reservation = execute_query(
            """SELECT r.*, p.property_id 
               FROM reservations r
               JOIN properties p ON r.property_id = p.property_id
               WHERE r.reservation_id = %s AND r.tenant_id = %s AND r.reservation_status = 'completed'""",
            (reservation_id, user_id), fetch_one=True
        )
        
        if not reservation:
            return jsonify({'message': 'Reservation not found or not eligible for review'}), 404
        
        # Daha önce değerlendirme yapılmış mı kontrol et
        existing_review = execute_query(
            "SELECT review_id FROM reviews WHERE reservation_id = %s",
            (reservation_id,), fetch_one=True
        )
        
        if existing_review:
            return jsonify({'message': 'Review already exists for this reservation'}), 409
        
        # Değerlendirme oluştur
        result = execute_query(
            """INSERT INTO reviews (property_id, tenant_id, reservation_id, rating, comment) 
               VALUES (%s, %s, %s, %s, %s)""",
            (reservation['property_id'], user_id, reservation_id, rating, comment)
        )
        
        return jsonify({
            'message': 'Review created successfully',
            'reviewId': result['last_insert_id']
        }), 201
        
    except Exception as e:
        return jsonify({'message': 'Failed to create review', 'error': str(e)}), 500

@reviews_bp.route('/property/<int:property_id>', methods=['GET'])
def get_property_reviews(property_id):
    try:
        limit = int(request.args.get('limit', 10))
        offset = int(request.args.get('offset', 0))
        
        reviews = execute_query(
            """SELECT r.*, u.first_name, u.last_name
               FROM reviews r
               JOIN users u ON r.tenant_id = u.user_id
               WHERE r.property_id = %s
               ORDER BY r.review_date DESC
               LIMIT %s OFFSET %s""",
            (property_id, limit, offset)
        )
        
        # Ortalama rating ve toplam yorum sayısı
        stats = execute_query(
            """SELECT AVG(rating) as average_rating, COUNT(*) as total_reviews
               FROM reviews WHERE property_id = %s""",
            (property_id,), fetch_one=True
        )
        
        return jsonify({
            'reviews': reviews,
            'stats': {
                'averageRating': round(float(stats['average_rating'] or 0), 1),
                'totalReviews': stats['total_reviews']
            },
            'pagination': {
                'limit': limit,
                'offset': offset,
                'hasMore': len(reviews) == limit
            }
        })
        
    except Exception as e:
        return jsonify({'message': 'Failed to fetch reviews', 'error': str(e)}), 500

@reviews_bp.route('/my-reviews', methods=['GET'])
@jwt_required()
def get_my_reviews():
    try:
        user_id = get_jwt_identity()
        
        reviews = execute_query(
            """SELECT r.*, p.title as property_title, p.address, p.city
               FROM reviews r
               JOIN properties p ON r.property_id = p.property_id
               WHERE r.tenant_id = %s
               ORDER BY r.review_date DESC""",
            (user_id,)
        )
        
        return jsonify({'reviews': reviews})
        
    except Exception as e:
        return jsonify({'message': 'Failed to fetch your reviews', 'error': str(e)}), 500
