-- Create database if it doesn't exist
CREATE DATABASE IF NOT EXISTS daydream CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Create user if it doesn't exist (MySQL 8.0+)
CREATE USER IF NOT EXISTS 'daydream-user'@'localhost' IDENTIFIED BY 'daydreampass';

-- Grant all privileges on the database to the user
GRANT ALL PRIVILEGES ON daydream.* TO 'daydream-user'@'localhost';

-- Flush privileges to apply changes
FLUSH PRIVILEGES;

-- Show confirmation
SELECT 'Database and user setup completed successfully!' AS Status;

