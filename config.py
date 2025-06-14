import os
from dotenv import load_dotenv

load_dotenv()

class Config:
    """Temel yapılandırma sınıfı"""
    SECRET_KEY = os.getenv('SECRET_KEY', 'your-secret-key-here')
    JWT_SECRET_KEY = os.getenv('JWT_SECRET_KEY', 'jwt-secret-string')
    
    # Database
    DB_HOST = os.getenv('DB_HOST', 'localhost')
    DB_USER = os.getenv('DB_USER', 'tinyuser')
    DB_PASSWORD = os.getenv('DB_PASSWORD', 'secure123')
    DB_NAME = os.getenv('DB_NAME', 'tiny_house_system')
    
    # File uploads
    UPLOAD_FOLDER = 'static/uploads'
    MAX_CONTENT_LENGTH = 16 * 1024 * 1024  # 16MB
    ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif', 'webp'}
    
    # JWT
    JWT_ACCESS_TOKEN_EXPIRES = False

class DevelopmentConfig(Config):
    DEBUG = True
    FLASK_ENV = 'development'

class ProductionConfig(Config):
    DEBUG = False
    FLASK_ENV = 'production'
    JWT_ACCESS_TOKEN_EXPIRES = 24 * 60 * 60  # 24 saat

config = {
    'development': DevelopmentConfig,
    'production': ProductionConfig,
    'default': DevelopmentConfig
}