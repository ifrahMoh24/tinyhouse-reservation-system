from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from utils.database import execute_query
import time

payments_bp = Blueprint('payments', __name__)

@payments_bp.route('/', methods=['POST'])
@jwt_required()
def create_payment():
    try:
        data = request.get_json()
        
        if not data.get('reservationId') or not data.get('paymentMethod'):
            return jsonify({'message': 'Reservation ID and payment method are required'}), 400
        
        reservation_id = data['reservationId']
        payment_method = data['paymentMethod']
        user_id = get_jwt_identity()
        
        # Rezervasyonun varlığını ve sahipliğini kontrol et
        reservation = execute_query(
            "SELECT * FROM reservations WHERE reservation_id = %s AND tenant_id = %s",
            (reservation_id, user_id), fetch_one=True
        )
        
        if not reservation:
            return jsonify({'message': 'Reservation not found or not authorized'}), 404
        
        # Benzersiz işlem ID'si oluştur
        transaction_id = f"TXN_{int(time.time())}_{reservation_id}"
        
        # Ödeme kaydını oluştur
        execute_query(
            """INSERT INTO payments (reservation_id, payment_amount, payment_method, payment_status, transaction_id) 
               VALUES (%s, %s, %s, 'completed', %s)""",
            (reservation_id, reservation['total_amount'], payment_method, transaction_id)
        )
        
        # Rezervasyon durumunu güncelle
        execute_query(
            'UPDATE reservations SET reservation_status = "confirmed" WHERE reservation_id = %s',
            (reservation_id,)
        )
        
        return jsonify({
            'message': 'Payment successful',
            'transactionId': transaction_id
        }), 201
        
    except Exception as e:
        return jsonify({'message': 'Payment processing failed', 'error': str(e)}), 500

@payments_bp.route('/history', methods=['GET'])
@jwt_required()
def get_payment_history():
    try:
        user_id = get_jwt_identity()
        
        payments = execute_query(
            """SELECT p.*, r.check_in_date, r.check_out_date, 
                      pr.title AS property_name
               FROM payments p
               JOIN reservations r ON p.reservation_id = r.reservation_id
               JOIN properties pr ON r.property_id = pr.property_id
               WHERE r.tenant_id = %s
               ORDER BY p.payment_date DESC""",
            (user_id,)
        )
        
        return jsonify({'payments': payments})
        
    except Exception as e:
        return jsonify({'message': 'Failed to retrieve payment history', 'error': str(e)}), 500
