// backend/config/validateEnv.js
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

// Required environment variables
const requiredEnvVars = [
  'DB_HOST',
  'DB_USER', 
  'DB_PASSWORD',
  'DB_NAME',
  'JWT_SECRET'
];

// Optional environment variables with defaults
const optionalEnvVars = {
  'PORT': '3001',
  'NODE_ENV': 'development',
  'FRONTEND_URL': 'http://127.0.0.1:5501'
};

function validateEnvironment() {
  console.log('🔍 Validating environment variables...');
  
  const missingVars = [];
  const warnings = [];
  
  // Check required variables
  requiredEnvVars.forEach(envVar => {
    if (!process.env[envVar]) {
      missingVars.push(envVar);
    } else {
      console.log(`✅ ${envVar}: Set`);
    }
  });
  
  // Set defaults for optional variables
  Object.entries(optionalEnvVars).forEach(([envVar, defaultValue]) => {
    if (!process.env[envVar]) {
      process.env[envVar] = defaultValue;
      warnings.push(`⚠️  ${envVar}: Using default value '${defaultValue}'`);
    } else {
      console.log(`✅ ${envVar}: ${process.env[envVar]}`);
    }
  });
  
  // Validate JWT_SECRET strength
  if (process.env.JWT_SECRET && process.env.JWT_SECRET.length < 32) {
    warnings.push('⚠️  JWT_SECRET should be at least 32 characters long for security');
  }
  
  // Show warnings
  warnings.forEach(warning => console.log(warning));
  
  // Exit if missing required variables
  if (missingVars.length > 0) {
    console.error('\n❌ Missing required environment variables:');
    missingVars.forEach(envVar => console.error(`   - ${envVar}`));
    console.error('\n📝 Please create a .env file with the following variables:');
    console.error('');
    
    requiredEnvVars.forEach(envVar => {
      switch(envVar) {
        case 'DB_HOST':
          console.error('DB_HOST=localhost');
          break;
        case 'DB_USER':
          console.error('DB_USER=tinyuser');
          break;
        case 'DB_PASSWORD':
          console.error('DB_PASSWORD=secure123');
          break;
        case 'DB_NAME':
          console.error('DB_NAME=tiny_house_system');
          break;
        case 'JWT_SECRET':
          console.error('JWT_SECRET=your_super_secret_jwt_key_here_make_it_long_and_secure');
          break;
        default:
          console.error(`${envVar}=your_value_here`);
      }
    });
    
    console.error('\n🔧 Optional variables:');
    Object.entries(optionalEnvVars).forEach(([envVar, defaultValue]) => {
      console.error(`${envVar}=${defaultValue}  # (default)`);
    });
    
    process.exit(1);
  }
  
  console.log('✅ Environment validation completed successfully\n');
}

module.exports = { validateEnvironment };