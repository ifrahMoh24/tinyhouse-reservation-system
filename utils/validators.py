import re
from datetime import datetime

def validate_email(email):
    """Email formatını doğrula"""
    pattern = r"^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$"
    return re.match(pattern, email) is not None

def validate_password(password):
    """Şifre güçlülüğünü kontrol et"""
    if len(password) < 6:
        return False, "Password must be at least 6 characters long"
    
    if not re.search(r"[A-Za-z]", password):
        return False, "Password must contain at least one letter"
    
    if not re.search(r"\d", password):
        return False, "Password must contain at least one number"
    
    return True, "Valid password"

def validate_phone(phone):
    """Telefon numarası formatını doğrula"""
    if not phone:
        return True  # Phone is optional
    
    # Türkiye telefon numarası formatı
    pattern = r"^(\+90|0)?[5][0-9]{9}$"
    return re.match(pattern, phone.replace(' ', '').replace('-', '')) is not None

def validate_date_range(check_in, check_out):
    """Tarih aralığını doğrula"""
    try:
        check_in_date = datetime.fromisoformat(check_in.replace('Z', '+00:00'))
        check_out_date = datetime.fromisoformat(check_out.replace('Z', '+00:00'))
        
        # Check-in bugünden önce olamaz
        if check_in_date.date() < datetime.now().date():
            return False, "Check-in date cannot be in the past"
        
        # Check-out check-in'den sonra olmalı
        if check_out_date <= check_in_date:
            return False, "Check-out date must be after check-in date"
        
        # Maksimum 30 gün
        if (check_out_date - check_in_date).days > 30:
            return False, "Maximum stay duration is 30 days"
        
        return True, "Valid date range"
        
    except Exception:
        return False, "Invalid date format"

def validate_price(price):
    """Fiyat validasyonu"""
    try:
        price_float = float(price)
        if price_float <= 0:
            return False, "Price must be greater than 0"
        if price_float > 10000:
            return False, "Price cannot exceed 10,000"
        return True, "Valid price"
    except:
        return False, "Invalid price format"

def validate_rating(rating):
    """Rating validasyonu"""
    try:
        rating_int = int(rating)
        if not 1 <= rating_int <= 5:
            return False, "Rating must be between 1 and 5"
        return True, "Valid rating"
    except:
        return False, "Invalid rating format"