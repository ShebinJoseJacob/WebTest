-- Seed data for IoT Worker Monitoring System
-- Insert sample users with hashed passwords (password123)

INSERT INTO users (name, email, password_hash, role, department) VALUES 
('System Admin', 'admin@iotmonitoring.com', '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBPj7wJB8OfRB6', 'supervisor', 'Management'),
('John Supervisor', 'supervisor@demo.com', '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBPj7wJB8OfRB6', 'supervisor', 'Safety'),
('Jane Employee', 'employee@demo.com', '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBPj7wJB8OfRB6', 'employee', 'Operations'),
('Mike Worker', 'mike@demo.com', '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBPj7wJB8OfRB6', 'employee', 'Operations'),
('Sarah Tech', 'sarah@demo.com', '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBPj7wJB8OfRB6', 'employee', 'Technical');

-- Insert sample devices
INSERT INTO devices (user_id, device_serial, device_model, battery_level) VALUES 
(3, 'IOT-DEVICE-001', 'HealthMonitor Pro', 85),
(4, 'IOT-DEVICE-002', 'HealthMonitor Pro', 92),
(5, 'IOT-DEVICE-003', 'HealthMonitor Pro', 78);