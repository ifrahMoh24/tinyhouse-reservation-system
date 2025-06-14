from functools import wraps
from flask import jsonify
from flask_jwt_extended import verify_jwt_in_request, get_jwt

def require_role(role):
    """Belirli rol gerektiren decorator"""
    def decorator(f):
        @wraps(f)
        def decorated_function(*args, **kwargs):
            verify_jwt_in_request()
            claims = get_jwt()
            if claims.get('role') != role:
                return jsonify({'message': f'{role.capitalize()} access required'}), 403
            return f(*args, **kwargs)
        return decorated_function
    return decorator

def admin_required(f):
    """Admin yetkisi gerektiren decorator"""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        verify_jwt_in_request()
        claims = get_jwt()
        if claims.get('role') != 'admin':
            return jsonify({'message': 'Admin access required'}), 403
        return f(*args, **kwargs)
    return decorated_function

def owner_required(f):
    """Mülk sahibi yetkisi gerektiren decorator"""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        verify_jwt_in_request()
        claims = get_jwt()
        if claims.get('role') != 'owner':
            return jsonify({'message': 'Owner access required'}), 403
        return f(*args, **kwargs)
    return decorated_function

def tenant_required(f):
    """Kiracı yetkisi gerektiren decorator"""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        verify_jwt_in_request()
        claims = get_jwt()
        if claims.get('role') != 'tenant':
            return jsonify({'message': 'Tenant access required'}), 403
        return f(*args, **kwargs)
    return decorated_function
