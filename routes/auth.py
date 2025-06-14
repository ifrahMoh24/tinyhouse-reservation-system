from flask import Blueprint, request, jsonify
from flask_jwt_extended import create_access_token, jwt_required, get_jwt_identity
import bcrypt
from utils.database import execute_query
import re

auth_bp = Blueprint('auth', __name__)

def validate_email(email):
    pattern = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
    return re.match(pattern, email) is not None

@auth_bp.route('/register', methods=['POST'])
def register():
    try:
        data = request.get_json()
        
        # Gerekli alanları kontrol et
        required_fields = ['firstName', 'lastName', 'email', 'password', 'userRole']
        for field in required_fields:
            if not data.get(field):
                return jsonify({'message': f'{field} is required'}), 400
        
        first_name = data['firstName'].strip()
        last_name = data['lastName'].strip()
        email = data['email'].strip().lower()
        password = data['password']
        phone = data.get('phone', '').strip()
        user_role = data['userRole']
        
        # Validasyon
        if not validate_email(email):
            return jsonify({'message': 'Invalid email format'}), 400
        
        if len(password) < 6:
            return jsonify({'message': 'Password must be at least 6 characters'}), 400
        
        if user_role not in ['tenant', 'owner']:
            return jsonify({'message': 'Invalid user role'}), 400
        
        # Kullanıcı zaten var mı kontrol et
        existing_user = execute_query(
            "SELECT user_id FROM users WHERE email = %s",
            (email,), fetch_one=True
        )
        
        if existing_user:
            return jsonify({'message': 'User already exists with this email'}), 409
        
        # Şifreyi hashle
        password_hash = bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
        
        # Kullanıcıyı oluştur
        result = execute_query(
            """INSERT INTO users (first_name, last_name, email, password_hash, phone, user_role) 
               VALUES (%s, %s, %s, %s, %s, %s)""",
            (first_name, last_name, email, password_hash, phone or None, user_role)
        )
        
        # JWT token oluştur - FIX: String'e çevir
        token = create_access_token(
            identity=str(result['last_insert_id']),  # ✅ String'e çevir
            additional_claims={'email': email, 'role': user_role}
        )
        
        return jsonify({
            'message': 'User registered successfully',
            'token': token,
            'user': {
                'id': result['last_insert_id'],
                'firstName': first_name,
                'lastName': last_name,
                'email': email,
                'role': user_role
            }
        }), 201
        
    except Exception as e:
        return jsonify({'message': 'Registration failed', 'error': str(e)}), 500

@auth_bp.route('/login', methods=['POST'])
def login():
    try:
        data = request.get_json()
        
        if not data.get('email') or not data.get('password'):
            return jsonify({'message': 'Email and password are required'}), 400
        
        email = data['email'].strip().lower()
        password = data['password']
        
        # Kullanıcıyı bul
        user = execute_query(
            """SELECT user_id, first_name, last_name, email, password_hash, 
                      user_role, is_active 
               FROM users WHERE email = %s""",
            (email,), fetch_one=True
        )
        
        if not user:
            return jsonify({'message': 'Invalid credentials'}), 401
        
        if not user['is_active']:
            return jsonify({'message': 'Account is deactivated'}), 401
        
        # Şifreyi kontrol et
        if not bcrypt.checkpw(password.encode('utf-8'), user['password_hash'].encode('utf-8')):
            return jsonify({'message': 'Invalid credentials'}), 401
        
        # Son giriş tarihini güncelle
        execute_query(
            "UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE user_id = %s",
            (user['user_id'],)
        )
        
        # JWT token oluştur - FIX: String'e çevir
        token = create_access_token(
            identity=str(user['user_id']),  # ✅ String'e çevir
            additional_claims={'email': user['email'], 'role': user['user_role']}
        )
        
        return jsonify({
            'message': 'Login successful',
            'token': token,
            'user': {
                'id': user['user_id'],
                'firstName': user['first_name'],
                'lastName': user['last_name'],
                'email': user['email'],
                'role': user['user_role']
            }
        })
        
    except Exception as e:
        return jsonify({'message': 'Login failed', 'error': str(e)}), 500

@auth_bp.route('/profile', methods=['GET'])
@jwt_required()
def get_profile():
    try:
        # JWT'den string olarak user_id al, integer'a çevir
        user_id_str = get_jwt_identity()
        user_id = int(user_id_str)  # ✅ String'den integer'a çevir
        
        print(f"🔍 DEBUG: User ID string: {user_id_str}")
        print(f"🔍 DEBUG: User ID int: {user_id}")
        
        user = execute_query(
            """SELECT user_id, first_name, last_name, email, phone, user_role, 
                      registration_date, last_login 
               FROM users WHERE user_id = %s""",
            (user_id,), fetch_one=True
        )
        
        if not user:
            print(f"❌ DEBUG: User not found for ID: {user_id}")
            return jsonify({'message': 'User not found'}), 404
        
        print(f"✅ DEBUG: User found: {user['email']}")
        return jsonify({'user': user})
        
    except ValueError as ve:
        print(f"❌ DEBUG: Invalid user ID format: {get_jwt_identity()}")
        return jsonify({'message': 'Invalid user ID in token'}), 422
    except Exception as e:
        print(f"❌ DEBUG: Profile error: {e}")
        return jsonify({'message': 'Failed to fetch profile', 'error': str(e)}), 500