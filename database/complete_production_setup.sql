-- Complete Production Setup for IoT Worker Monitoring System
-- This script will completely reset and set up the database from scratch
-- Run this script on your production database

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "btree_gin";

-- Drop existing tables if they exist (for fresh setup)
DROP TABLE IF EXISTS attendance CASCADE;
DROP TABLE IF EXISTS alerts CASCADE;
DROP TABLE IF EXISTS vitals CASCADE;
DROP TABLE IF EXISTS devices CASCADE;
DROP TABLE IF EXISTS users CASCADE;

-- Drop custom types
DROP TYPE IF EXISTS user_role CASCADE;
DROP TYPE IF EXISTS attendance_status CASCADE;
DROP TYPE IF EXISTS alert_type CASCADE;
DROP TYPE IF EXISTS alert_severity CASCADE;

-- Drop views
DROP VIEW IF EXISTS user_device_summary CASCADE;
DROP VIEW IF EXISTS latest_vitals CASCADE;
DROP VIEW IF EXISTS daily_attendance_summary CASCADE;
DROP VIEW IF EXISTS alert_statistics CASCADE;

-- Drop functions
DROP FUNCTION IF EXISTS update_updated_at_column() CASCADE;
DROP FUNCTION IF EXISTS calculate_attendance_hours() CASCADE;
DROP FUNCTION IF EXISTS auto_resolve_old_alerts() CASCADE;
DROP FUNCTION IF EXISTS get_user_vitals_summary(INTEGER, INTEGER) CASCADE;
DROP FUNCTION IF EXISTS cleanup_old_data() CASCADE;

-- Create ENUM types for better data integrity
CREATE TYPE user_role AS ENUM ('employee', 'supervisor');
CREATE TYPE attendance_status AS ENUM ('present', 'absent', 'partial');
CREATE TYPE alert_type AS ENUM ('fall', 'heart_rate', 'spo2', 'temperature', 'offline');
CREATE TYPE alert_severity AS ENUM ('low', 'medium', 'high', 'critical');

-- Users table
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role user_role NOT NULL DEFAULT 'employee',
    department VARCHAR(100),
    phone VARCHAR(20),
    emergency_contact_name VARCHAR(255),
    emergency_contact_phone VARCHAR(20),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Constraints
    CONSTRAINT users_email_check CHECK (email ~* '^[A-Za-z0-9._%-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,4}$'),
    CONSTRAINT users_name_check CHECK (LENGTH(name) >= 2)
);

-- Devices table
CREATE TABLE devices (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    device_serial VARCHAR(255) UNIQUE NOT NULL,
    device_model VARCHAR(100),
    firmware_version VARCHAR(50),
    battery_level INTEGER DEFAULT 100 CHECK (battery_level >= 0 AND battery_level <= 100),
    last_seen TIMESTAMP,
    is_active BOOLEAN DEFAULT true,
    registration_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_maintenance TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Constraints
    CONSTRAINT devices_serial_check CHECK (LENGTH(device_serial) >= 5),
    CONSTRAINT devices_unique_active_per_user UNIQUE (user_id) DEFERRABLE INITIALLY DEFERRED
);

-- Vitals table
CREATE TABLE vitals (
    id SERIAL PRIMARY KEY,
    device_id INTEGER REFERENCES devices(id) ON DELETE CASCADE,
    heart_rate INTEGER CHECK (heart_rate > 0 AND heart_rate < 300),
    spo2 INTEGER CHECK (spo2 >= 0 AND spo2 <= 100),
    temperature DECIMAL(4,2) CHECK (temperature > 30.0 AND temperature < 45.0),
    latitude DECIMAL(10,8) CHECK (latitude >= -90 AND latitude <= 90),
    longitude DECIMAL(11,8) CHECK (longitude >= -180 AND longitude <= 180),
    gps_accuracy DECIMAL(6,2) CHECK (gps_accuracy >= 0),
    altitude DECIMAL(8,2),
    fall_detected BOOLEAN DEFAULT false,
    movement_intensity INTEGER CHECK (movement_intensity >= 0 AND movement_intensity <= 100),
    ambient_temperature DECIMAL(4,2),
    humidity INTEGER CHECK (humidity >= 0 AND humidity <= 100),
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT vitals_timestamp_check CHECK (timestamp <= CURRENT_TIMESTAMP + INTERVAL '1 hour')
);

-- Alerts table
CREATE TABLE alerts (
    id SERIAL PRIMARY KEY,
    device_id INTEGER REFERENCES devices(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    type alert_type NOT NULL,
    severity alert_severity NOT NULL DEFAULT 'medium',
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    value DECIMAL(10,2),
    threshold DECIMAL(10,2),
    location_lat DECIMAL(10,8),
    location_lng DECIMAL(11,8),
    acknowledged BOOLEAN DEFAULT false,
    acknowledged_by INTEGER REFERENCES users(id),
    acknowledged_at TIMESTAMP,
    resolved BOOLEAN DEFAULT false,
    resolved_by INTEGER REFERENCES users(id),
    resolved_at TIMESTAMP,
    auto_resolved BOOLEAN DEFAULT false,
    escalated BOOLEAN DEFAULT false,
    escalated_at TIMESTAMP,
    escalated_to INTEGER REFERENCES users(id),
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT alerts_ack_consistency CHECK (
        (acknowledged = false) OR 
        (acknowledged = true AND acknowledged_by IS NOT NULL AND acknowledged_at IS NOT NULL)
    ),
    CONSTRAINT alerts_resolved_consistency CHECK (
        (resolved = false) OR 
        (resolved = true AND resolved_at IS NOT NULL)
    ),
    CONSTRAINT alerts_escalation_consistency CHECK (
        (escalated = false) OR 
        (escalated = true AND escalated_at IS NOT NULL AND escalated_to IS NOT NULL)
    ),
    CONSTRAINT alerts_timestamp_check CHECK (timestamp <= CURRENT_TIMESTAMP + INTERVAL '1 hour')
);

-- Attendance table
CREATE TABLE attendance (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    check_in_time TIMESTAMP,
    check_out_time TIMESTAMP,
    total_hours DECIMAL(4,2) CHECK (total_hours >= 0 AND total_hours <= 24),
    break_duration DECIMAL(4,2) DEFAULT 0 CHECK (break_duration >= 0),
    overtime_hours DECIMAL(4,2) DEFAULT 0 CHECK (overtime_hours >= 0),
    status attendance_status DEFAULT 'present',
    notes TEXT,
    approved_by INTEGER REFERENCES users(id),
    approved_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT attendance_unique_user_date UNIQUE (user_id, date),
    CONSTRAINT attendance_checkout_after_checkin CHECK (
        check_out_time IS NULL OR check_in_time IS NULL OR check_out_time > check_in_time
    ),
    CONSTRAINT attendance_date_not_future CHECK (date <= CURRENT_DATE)
);

-- Reset all sequences to start from 1
ALTER SEQUENCE users_id_seq RESTART WITH 1;
ALTER SEQUENCE devices_id_seq RESTART WITH 1;
ALTER SEQUENCE vitals_id_seq RESTART WITH 1;
ALTER SEQUENCE alerts_id_seq RESTART WITH 1;
ALTER SEQUENCE attendance_id_seq RESTART WITH 1;

-- Create indexes for performance optimization
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_users_department ON users(department);
CREATE INDEX idx_users_active ON users(is_active);

CREATE INDEX idx_devices_user_id ON devices(user_id);
CREATE INDEX idx_devices_serial ON devices(device_serial);
CREATE INDEX idx_devices_active ON devices(is_active);
CREATE INDEX idx_devices_last_seen ON devices(last_seen DESC);

CREATE INDEX idx_vitals_device_id ON vitals(device_id);
CREATE INDEX idx_vitals_timestamp ON vitals(timestamp DESC);
CREATE INDEX idx_vitals_device_timestamp ON vitals(device_id, timestamp DESC);
CREATE INDEX idx_vitals_fall_detected ON vitals(fall_detected) WHERE fall_detected = true;
CREATE INDEX idx_vitals_location ON vitals(latitude, longitude) WHERE latitude IS NOT NULL AND longitude IS NOT NULL;

CREATE INDEX idx_alerts_device_id ON alerts(device_id);
CREATE INDEX idx_alerts_user_id ON alerts(user_id);
CREATE INDEX idx_alerts_timestamp ON alerts(timestamp DESC);
CREATE INDEX idx_alerts_severity ON alerts(severity);
CREATE INDEX idx_alerts_acknowledged ON alerts(acknowledged, timestamp DESC);

CREATE INDEX idx_attendance_user_id ON attendance(user_id);
CREATE INDEX idx_attendance_date ON attendance(date DESC);
CREATE INDEX idx_attendance_user_date ON attendance(user_id, date DESC);

-- Create trigger functions for automatic timestamp updates
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers for updated_at columns
CREATE TRIGGER update_users_updated_at 
    BEFORE UPDATE ON users 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_devices_updated_at 
    BEFORE UPDATE ON devices 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_attendance_updated_at 
    BEFORE UPDATE ON attendance 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Create function to automatically calculate attendance total hours
CREATE OR REPLACE FUNCTION calculate_attendance_hours()
RETURNS TRIGGER AS $$
BEGIN
    -- Calculate total hours when both check_in and check_out are set
    IF NEW.check_in_time IS NOT NULL AND NEW.check_out_time IS NOT NULL THEN
        NEW.total_hours = EXTRACT(EPOCH FROM (NEW.check_out_time - NEW.check_in_time)) / 3600.0;
        
        -- Subtract break duration if specified
        IF NEW.break_duration IS NOT NULL THEN
            NEW.total_hours = NEW.total_hours - NEW.break_duration;
        END IF;
        
        -- Calculate overtime (assuming 8 hours standard)
        IF NEW.total_hours > 8 THEN
            NEW.overtime_hours = NEW.total_hours - 8;
        ELSE
            NEW.overtime_hours = 0;
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger for attendance hours calculation
CREATE TRIGGER calculate_attendance_hours_trigger
    BEFORE INSERT OR UPDATE ON attendance
    FOR EACH ROW EXECUTE FUNCTION calculate_attendance_hours();

-- Create views for common queries
CREATE VIEW user_device_summary AS
SELECT 
    u.id as user_id,
    u.name as user_name,
    u.email,
    u.role,
    u.department,
    u.is_active as user_active,
    d.id as device_id,
    d.device_serial,
    d.device_model,
    d.battery_level,
    d.last_seen,
    d.is_active as device_active,
    CASE 
        WHEN d.last_seen > CURRENT_TIMESTAMP - INTERVAL '10 minutes' THEN 'online'
        WHEN d.last_seen > CURRENT_TIMESTAMP - INTERVAL '1 hour' THEN 'away'
        ELSE 'offline'
    END as device_status
FROM users u
LEFT JOIN devices d ON u.id = d.user_id
WHERE u.is_active = true;

CREATE VIEW latest_vitals AS
SELECT DISTINCT ON (v.device_id)
    v.device_id,
    v.heart_rate,
    v.spo2,
    v.temperature,
    v.latitude,
    v.longitude,
    v.gps_accuracy,
    v.fall_detected,
    v.timestamp,
    u.id as user_id,
    u.name as user_name,
    d.device_serial
FROM vitals v
JOIN devices d ON v.device_id = d.id
JOIN users u ON d.user_id = u.id
ORDER BY v.device_id, v.timestamp DESC;

-- INSERT PRODUCTION DATA
-- Password for all accounts: AdminPass123!
-- Hash: $2a$12$PHg0e3GI8N79A5472Qzu2OMjqreRZicvuejee84VUQ0mgqYHrJSFO

-- Insert supervisors and employees
INSERT INTO users (name, email, password_hash, role, department, phone, emergency_contact_name, emergency_contact_phone) VALUES 
-- Supervisors
('System Admin', 'admin@company.com', '$2a$12$PHg0e3GI8N79A5472Qzu2OMjqreRZicvuejee84VUQ0mgqYHrJSFO', 'supervisor', 'Management', '+1-555-0001', 'Emergency Line', '+1-911-0000'),
('Operations Supervisor', 'supervisor@company.com', '$2a$12$PHg0e3GI8N79A5472Qzu2OMjqreRZicvuejee84VUQ0mgqYHrJSFO', 'supervisor', 'Operations', '+1-555-0002', 'Sarah Johnson', '+1-555-0102'),
('Safety Manager', 'safety@company.com', '$2a$12$PHg0e3GI8N79A5472Qzu2OMjqreRZicvuejee84VUQ0mgqYHrJSFO', 'supervisor', 'Safety', '+1-555-0003', 'Mike Davis', '+1-555-0103'),

-- Employees (Starting from ID 4)
('Alice Johnson', 'alice.johnson@company.com', '$2a$12$PHg0e3GI8N79A5472Qzu2OMjqreRZicvuejee84VUQ0mgqYHrJSFO', 'employee', 'Manufacturing', '+1-555-1001', 'Bob Johnson', '+1-555-2001'),
('Bob Smith', 'bob.smith@company.com', '$2a$12$PHg0e3GI8N79A5472Qzu2OMjqreRZicvuejee84VUQ0mgqYHrJSFO', 'employee', 'Manufacturing', '+1-555-1002', 'Alice Smith', '+1-555-2002'),
('Carol Davis', 'carol.davis@company.com', '$2a$12$PHg0e3GI8N79A5472Qzu2OMjqreRZicvuejee84VUQ0mgqYHrJSFO', 'employee', 'Quality Control', '+1-555-1003', 'John Davis', '+1-555-2003'),
('David Wilson', 'david.wilson@company.com', '$2a$12$PHg0e3GI8N79A5472Qzu2OMjqreRZicvuejee84VUQ0mgqYHrJSFO', 'employee', 'Warehouse', '+1-555-1004', 'Emma Wilson', '+1-555-2004'),
('Emma Brown', 'emma.brown@company.com', '$2a$12$PHg0e3GI8N79A5472Qzu2OMjqreRZicvuejee84VUQ0mgqYHrJSFO', 'employee', 'Logistics', '+1-555-1005', 'David Brown', '+1-555-2005'),
('Frank Garcia', 'frank.garcia@company.com', '$2a$12$PHg0e3GI8N79A5472Qzu2OMjqreRZicvuejee84VUQ0mgqYHrJSFO', 'employee', 'Maintenance', '+1-555-1006', 'Sofia Garcia', '+1-555-2006'),
('Grace Martinez', 'grace.martinez@company.com', '$2a$12$PHg0e3GI8N79A5472Qzu2OMjqreRZicvuejee84VUQ0mgqYHrJSFO', 'employee', 'Security', '+1-555-1007', 'Luis Martinez', '+1-555-2007'),
('Henry Lee', 'henry.lee@company.com', '$2a$12$PHg0e3GI8N79A5472Qzu2OMjqreRZicvuejee84VUQ0mgqYHrJSFO', 'employee', 'Manufacturing', '+1-555-1008', 'Anna Lee', '+1-555-2008'),
('Ivy Chen', 'ivy.chen@company.com', '$2a$12$PHg0e3GI8N79A5472Qzu2OMjqreRZicvuejee84VUQ0mgqYHrJSFO', 'employee', 'Quality Control', '+1-555-1009', 'Chen Wei', '+1-555-2009'),
('Jack Taylor', 'jack.taylor@company.com', '$2a$12$PHg0e3GI8N79A5472Qzu2OMjqreRZicvuejee84VUQ0mgqYHrJSFO', 'employee', 'Warehouse', '+1-555-1010', 'Mary Taylor', '+1-555-2010'),
('Kate Anderson', 'kate.anderson@company.com', '$2a$12$PHg0e3GI8N79A5472Qzu2OMjqreRZicvuejee84VUQ0mgqYHrJSFO', 'employee', 'Logistics', '+1-555-1011', 'Tom Anderson', '+1-555-2011'),
('Liam Rodriguez', 'liam.rodriguez@company.com', '$2a$12$PHg0e3GI8N79A5472Qzu2OMjqreRZicvuejee84VUQ0mgqYHrJSFO', 'employee', 'Maintenance', '+1-555-1012', 'Maria Rodriguez', '+1-555-2012');

-- Insert devices for each employee (12 devices total)
INSERT INTO devices (user_id, device_serial, device_model, firmware_version, battery_level) VALUES 
(4, 'IOT-DEVICE-001', 'HealthMonitor Pro v2.1', '2.1.3', 95),
(5, 'IOT-DEVICE-002', 'HealthMonitor Pro v2.1', '2.1.3', 88),
(6, 'IOT-DEVICE-003', 'HealthMonitor Pro v2.1', '2.1.3', 92),
(7, 'IOT-DEVICE-004', 'HealthMonitor Pro v2.1', '2.1.3', 87),
(8, 'IOT-DEVICE-005', 'HealthMonitor Pro v2.1', '2.1.3', 91),
(9, 'IOT-DEVICE-006', 'HealthMonitor Pro v2.1', '2.1.3', 89),
(10, 'IOT-DEVICE-007', 'HealthMonitor Pro v2.1', '2.1.3', 94),
(11, 'IOT-DEVICE-008', 'HealthMonitor Pro v2.1', '2.1.3', 86),
(12, 'IOT-DEVICE-009', 'HealthMonitor Pro v2.1', '2.1.3', 93),
(13, 'IOT-DEVICE-010', 'HealthMonitor Pro v2.1', '2.1.3', 90),
(14, 'IOT-DEVICE-011', 'HealthMonitor Pro v2.1', '2.1.3', 85),
(15, 'IOT-DEVICE-012', 'HealthMonitor Pro v2.1', '2.1.3', 88);

COMMIT;

-- Display setup summary
SELECT 'Database setup completed successfully!' as message;
SELECT 'Login Credentials - Password for ALL accounts: AdminPass123!' as credentials;
SELECT 'Supervisors:' as user_type;
SELECT id, name, email, role, department FROM users WHERE role = 'supervisor' ORDER BY id;
SELECT 'Employees:' as user_type;
SELECT id, name, email, role, department FROM users WHERE role = 'employee' ORDER BY id;
SELECT 'Devices:' as devices_info;
SELECT d.id, d.device_serial, u.name as assigned_to FROM devices d JOIN users u ON d.user_id = u.id ORDER BY d.id;