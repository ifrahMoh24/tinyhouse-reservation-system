from flask import Flask, g, send_from_directory
from flask_cors import CORS
from flask_jwt_extended import JWTManager
import os
from dotenv import load_dotenv
from utils.database import close_db

# Çevre değişkenlerini yükle
load_dotenv()

def create_app():
    app = Flask(__name__)
    
    # Yapılandırma
    app.config['SECRET_KEY'] = os.getenv('SECRET_KEY', 'your-secret-key-here')
    app.config['JWT_SECRET_KEY'] = os.getenv('JWT_SECRET_KEY', 'jwt-secret-string')
    app.config['JWT_ACCESS_TOKEN_EXPIRES'] = False
    
    # MySQL Database yapılandırması
    app.config['DB_HOST'] = os.getenv('DB_HOST', 'localhost')
    app.config['DB_USER'] = os.getenv('DB_USER', 'tinyuser')
    app.config['DB_PASSWORD'] = os.getenv('DB_PASSWORD', 'secure123')
    app.config['DB_NAME'] = os.getenv('DB_NAME', 'tiny_house_system')
    
    # Upload klasörü
    app.config['UPLOAD_FOLDER'] = 'static/uploads'
    app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024
    
    # CORS ve JWT'yi başlat
    CORS(app, origins=['*'], supports_credentials=True)
    jwt = JWTManager(app)
    
    # Upload klasörünü oluştur
    os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)
    os.makedirs(os.path.join(app.config['UPLOAD_FOLDER'], 'properties'), exist_ok=True)
    
    # Veritabanı teardown
    app.teardown_appcontext(close_db)
    
    # Frontend static files için route'lar
    @app.route('/frontend')
    @app.route('/frontend/')
    def frontend_index():
        return send_from_directory('frontend', 'index.html')
    
    @app.route('/frontend/<path:filename>')
    def serve_frontend(filename):
        return send_from_directory('frontend', filename)
    
    # API Routes'ları kaydet
    from routes.auth import auth_bp
    from routes.properties import properties_bp
    from routes.reservations import reservations_bp
    from routes.payments import payments_bp
    from routes.reviews import reviews_bp
    from routes.admin import admin_bp
    
    app.register_blueprint(auth_bp, url_prefix='/auth')
    app.register_blueprint(properties_bp, url_prefix='/properties')
    app.register_blueprint(reservations_bp, url_prefix='/reservations')
    app.register_blueprint(payments_bp, url_prefix='/payments')
    app.register_blueprint(reviews_bp, url_prefix='/reviews')
    app.register_blueprint(admin_bp, url_prefix='/admin')
    
    # Health check endpoint
    @app.route('/api/health')
    def health_check():
        return {
            'status': 'OK',
            'message': 'TinyHouse Flask Backend is running!',
            'version': '1.0.0'
        }
    
    # Ana sayfa (API endpoints)
    @app.route('/')
    def index():
        return {
            'message': 'TinyHouse API Backend',
            'status': 'active',
            'endpoints': {
                'auth': '/auth',
                'properties': '/properties',
                'reservations': '/reservations',
                'payments': '/payments',
                'reviews': '/reviews',
                'admin': '/admin',
                'health': '/api/health',
                'frontend': '/frontend'
            }
        }
    
    return app

if __name__ == '__main__':
    app = create_app()
    port = int(os.getenv('PORT', 3001))
    print(f"🚀 Flask server starting on http://localhost:{port}")
    print(f"🌐 Frontend: httt:{port}/frontendp://localhos")
    print(f"📍 Health check: http://localhost:{port}/api/health")
    app.run(
        host='0.0.0.0',
        port=port,
        debug=os.getenv('FLASK_ENV') == 'development'
    )