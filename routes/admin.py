# ===============================================
# UPDATED routes/admin.py - COMPLETE FILE
# ===============================================

from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity, get_jwt
from utils.database import execute_query

admin_bp = Blueprint('admin', __name__)

def require_admin():
    claims = get_jwt()
    if claims.get('role') != 'admin':
        return jsonify({'message': 'Admin access required'}), 403
    return None

@admin_bp.route('/dashboard-stats', methods=['GET'])
@jwt_required()
def get_dashboard_stats():
    try:
        claims = get_jwt()
        if claims.get('role') != 'admin':
            return jsonify({'message': 'Admin access required'}), 403
        
        # Total users
        user_stats = execute_query(
            'SELECT COUNT(*) as total, COUNT(CASE WHEN is_active = 1 THEN 1 END) as active FROM users WHERE user_role != "admin"',
            fetch_one=True
        )
        
        # Total properties
        property_stats = execute_query(
            'SELECT COUNT(*) as total FROM properties WHERE is_active = 1',
            fetch_one=True
        )
        
        # Total reservations
        reservation_stats = execute_query(
            'SELECT COUNT(*) as total, COUNT(CASE WHEN reservation_status = "pending" THEN 1 END) as pending FROM reservations',
            fetch_one=True
        )
        
        # Total revenue
        revenue_stats = execute_query(
            """SELECT COALESCE(SUM(total_amount), 0) as total 
               FROM reservations 
               WHERE reservation_status = 'completed'""",
            fetch_one=True
        )
        
        return jsonify({
            'totalUsers': user_stats['total'],
            'activeUsers': user_stats['active'],
            'totalProperties': property_stats['total'],
            'totalReservations': reservation_stats['total'],
            'pendingReservations': reservation_stats['pending'],
            'totalRevenue': float(revenue_stats['total'])
        })
        
    except Exception as e:
        return jsonify({'message': 'Failed to fetch dashboard statistics', 'error': str(e)}), 500

@admin_bp.route('/users', methods=['GET'])
@jwt_required()
def get_all_users():
    try:
        claims = get_jwt()
        if claims.get('role') != 'admin':
            return jsonify({'message': 'Admin access required'}), 403
        
        role_filter = request.args.get('role')
        status_filter = request.args.get('status')
        limit = int(request.args.get('limit', 100))
        offset = int(request.args.get('offset', 0))
        
        query = """SELECT user_id, first_name, last_name, email, user_role, is_active, 
                          registration_date, last_login
                   FROM users
                   WHERE user_role != 'admin'"""
        params = []
        
        if role_filter:
            query += " AND user_role = %s"
            params.append(role_filter)
            
        if status_filter == 'active':
            query += " AND is_active = 1"
        elif status_filter == 'inactive':
            query += " AND is_active = 0"
        
        query += " ORDER BY registration_date DESC LIMIT %s OFFSET %s"
        params.extend([limit, offset])
        
        users = execute_query(query, params)
        
        return jsonify({
            'users': users,
            'pagination': {
                'limit': limit,
                'offset': offset,
                'hasMore': len(users) == limit
            }
        })
        
    except Exception as e:
        return jsonify({'message': 'Failed to fetch users', 'error': str(e)}), 500

@admin_bp.route('/properties', methods=['GET'])
@jwt_required()
def get_all_properties():
    try:
        claims = get_jwt()
        if claims.get('role') != 'admin':
            return jsonify({'message': 'Admin access required'}), 403
        
        status_filter = request.args.get('status')
        limit = int(request.args.get('limit', 100))
        offset = int(request.args.get('offset', 0))
        
        query = """SELECT p.*, u.first_name as owner_first_name, u.last_name as owner_last_name,
                          COUNT(DISTINCT r.reservation_id) as total_bookings,
                          COALESCE(AVG(rev.rating), 0) as average_rating,
                          COUNT(DISTINCT rev.review_id) as review_count
                   FROM properties p
                   LEFT JOIN users u ON p.owner_id = u.user_id
                   LEFT JOIN reservations r ON p.property_id = r.property_id
                   LEFT JOIN reviews rev ON p.property_id = rev.property_id"""
        
        params = []
        
        if status_filter == 'active':
            query += " WHERE p.is_active = 1"
        elif status_filter == 'inactive':
            query += " WHERE p.is_active = 0"
        
        query += """ GROUP BY p.property_id
                     ORDER BY p.created_at DESC
                     LIMIT %s OFFSET %s"""
        params.extend([limit, offset])
        
        properties = execute_query(query, params)
        
        return jsonify({
            'properties': properties,
            'pagination': {
                'limit': limit,
                'offset': offset,
                'hasMore': len(properties) == limit
            }
        })
        
    except Exception as e:
        return jsonify({'message': 'Failed to fetch properties', 'error': str(e)}), 500

@admin_bp.route('/users/<int:user_id>/toggle-status', methods=['PUT'])
@jwt_required()
def toggle_user_status(user_id):
    try:
        claims = get_jwt()
        if claims.get('role') != 'admin':
            return jsonify({'message': 'Admin access required'}), 403
        
        # Check if user exists and is not admin
        user = execute_query(
            "SELECT user_role, is_active FROM users WHERE user_id = %s",
            (user_id,), fetch_one=True
        )
        
        if not user:
            return jsonify({'message': 'User not found'}), 404
            
        if user['user_role'] == 'admin':
            return jsonify({'message': 'Cannot modify admin users'}), 403
        
        # Toggle status
        new_status = not user['is_active']
        execute_query(
            "UPDATE users SET is_active = %s WHERE user_id = %s",
            (new_status, user_id)
        )
        
        status_text = "activated" if new_status else "deactivated"
        return jsonify({'message': f'User {status_text} successfully'})
        
    except Exception as e:
        return jsonify({'message': 'Failed to toggle user status', 'error': str(e)}), 500