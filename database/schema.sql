-- IoT Worker Monitoring System Database Schema
-- PostgreSQL Database Schema for production deployment

-- Create database (run this separately if needed)
-- CREATE DATABASE iot_monitoring;
-- \c iot_monitoring;

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
    
    -- Indexes will be created separately
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
    
    -- Constraints
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
    
    -- Constraints
    CONSTRAINT attendance_unique_user_date UNIQUE (user_id, date),
    CONSTRAINT attendance_checkout_after_checkin CHECK (
        check_out_time IS NULL OR check_in_time IS NULL OR check_out_time > check_in_time
    ),
    CONSTRAINT attendance_date_not_future CHECK (date <= CURRENT_DATE)
);

-- Create indexes for performance optimization
CREATE INDEX CONCURRENTLY idx_users_email ON users(email);
CREATE INDEX CONCURRENTLY idx_users_role ON users(role);
CREATE INDEX CONCURRENTLY idx_users_department ON users(department);
CREATE INDEX CONCURRENTLY idx_users_active ON users(is_active);

CREATE INDEX CONCURRENTLY idx_devices_user_id ON devices(user_id);
CREATE INDEX CONCURRENTLY idx_devices_serial ON devices(device_serial);
CREATE INDEX CONCURRENTLY idx_devices_active ON devices(is_active);
CREATE INDEX CONCURRENTLY idx_devices_last_seen ON devices(last_seen DESC);

CREATE INDEX CONCURRENTLY idx_vitals_device_id ON vitals(device_id);
CREATE INDEX CONCURRENTLY idx_vitals_timestamp ON vitals(timestamp DESC);
CREATE INDEX CONCURRENTLY idx_vitals_device_timestamp ON vitals(device_id, timestamp DESC);
CREATE INDEX CONCURRENTLY idx_vitals_fall_detected ON vitals(fall_detected) WHERE fall_detected = true;
CREATE INDEX CONCURRENTLY idx_vitals_location ON vitals(latitude, longitude) WHERE latitude IS NOT NULL AND longitude IS NOT NULL;
CREATE INDEX CONCURRENTLY idx_vitals_heart_rate ON vitals(heart_rate) WHERE heart_rate IS NOT NULL;
CREATE INDEX CONCURRENTLY idx_vitals_spo2 ON vitals(spo2) WHERE spo2 IS NOT NULL;
CREATE INDEX CONCURRENTLY idx_vitals_temperature ON vitals(temperature) WHERE temperature IS NOT NULL;

CREATE INDEX CONCURRENTLY idx_alerts_device_id ON alerts(device_id);
CREATE INDEX CONCURRENTLY idx_alerts_user_id ON alerts(user_id);
CREATE INDEX CONCURRENTLY idx_alerts_timestamp ON alerts(timestamp DESC);
CREATE INDEX CONCURRENTLY idx_alerts_severity ON alerts(severity);
CREATE INDEX CONCURRENTLY idx_alerts_type ON alerts(type);
CREATE INDEX CONCURRENTLY idx_alerts_acknowledged ON alerts(acknowledged, timestamp DESC);
CREATE INDEX CONCURRENTLY idx_alerts_resolved ON alerts(resolved, timestamp DESC);
CREATE INDEX CONCURRENTLY idx_alerts_critical_unack ON alerts(severity, acknowledged) WHERE severity = 'critical' AND acknowledged = false;

CREATE INDEX CONCURRENTLY idx_attendance_user_id ON attendance(user_id);
CREATE INDEX CONCURRENTLY idx_attendance_date ON attendance(date DESC);
CREATE INDEX CONCURRENTLY idx_attendance_user_date ON attendance(user_id, date DESC);
CREATE INDEX CONCURRENTLY idx_attendance_status ON attendance(status);

-- Create full-text search indexes
CREATE INDEX CONCURRENTLY idx_users_name_gin ON users USING gin(name gin_trgm_ops);
CREATE INDEX CONCURRENTLY idx_alerts_message_gin ON alerts USING gin(message gin_trgm_ops);

-- Create composite indexes for common queries
CREATE INDEX CONCURRENTLY idx_vitals_device_recent ON vitals(device_id, timestamp DESC) WHERE timestamp > CURRENT_TIMESTAMP - INTERVAL '24 hours';
CREATE INDEX CONCURRENTLY idx_alerts_user_recent ON alerts(user_id, timestamp DESC) WHERE timestamp > CURRENT_TIMESTAMP - INTERVAL '7 days';

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

-- Create function to auto-resolve alerts after a certain time
CREATE OR REPLACE FUNCTION auto_resolve_old_alerts()
RETURNS TRIGGER AS $$
BEGIN
    -- Auto-resolve non-critical alerts older than 24 hours
    UPDATE alerts 
    SET resolved = true, auto_resolved = true, resolved_at = CURRENT_TIMESTAMP
    WHERE resolved = false 
    AND severity != 'critical' 
    AND timestamp < CURRENT_TIMESTAMP - INTERVAL '24 hours';
    
    RETURN NULL;
END;
$$ language 'plpgsql';

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

CREATE VIEW daily_attendance_summary AS
SELECT 
    a.date,
    COUNT(*) as total_employees,
    COUNT(CASE WHEN a.status = 'present' THEN 1 END) as present_count,
    COUNT(CASE WHEN a.status = 'absent' THEN 1 END) as absent_count,
    COUNT(CASE WHEN a.status = 'partial' THEN 1 END) as partial_count,
    ROUND(AVG(a.total_hours), 2) as avg_hours,
    SUM(a.overtime_hours) as total_overtime
FROM attendance a
GROUP BY a.date
ORDER BY a.date DESC;

CREATE VIEW alert_statistics AS
SELECT 
    DATE_TRUNC('day', timestamp) as alert_date,
    severity,
    type,
    COUNT(*) as alert_count,
    COUNT(CASE WHEN acknowledged THEN 1 END) as acknowledged_count,
    COUNT(CASE WHEN resolved THEN 1 END) as resolved_count,
    AVG(EXTRACT(EPOCH FROM (COALESCE(acknowledged_at, CURRENT_TIMESTAMP) - timestamp))/60) as avg_response_time_minutes
FROM alerts
WHERE timestamp > CURRENT_TIMESTAMP - INTERVAL '30 days'
GROUP BY DATE_TRUNC('day', timestamp), severity, type
ORDER BY alert_date DESC, severity DESC;

-- Create stored procedures for common operations
CREATE OR REPLACE FUNCTION get_user_vitals_summary(p_user_id INTEGER, p_days INTEGER DEFAULT 7)
RETURNS TABLE (
    avg_heart_rate NUMERIC,
    min_heart_rate INTEGER,
    max_heart_rate INTEGER,
    avg_spo2 NUMERIC,
    min_spo2 INTEGER,
    max_spo2 INTEGER,
    avg_temperature NUMERIC,
    min_temperature NUMERIC,
    max_temperature NUMERIC,
    total_readings BIGINT,
    fall_incidents BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        ROUND(AVG(v.heart_rate), 1) as avg_heart_rate,
        MIN(v.heart_rate) as min_heart_rate,
        MAX(v.heart_rate) as max_heart_rate,
        ROUND(AVG(v.spo2), 1) as avg_spo2,
        MIN(v.spo2) as min_spo2,
        MAX(v.spo2) as max_spo2,
        ROUND(AVG(v.temperature), 1) as avg_temperature,
        MIN(v.temperature) as min_temperature,
        MAX(v.temperature) as max_temperature,
        COUNT(*) as total_readings,
        COUNT(CASE WHEN v.fall_detected THEN 1 END) as fall_incidents
    FROM vitals v
    JOIN devices d ON v.device_id = d.id
    WHERE d.user_id = p_user_id
    AND v.timestamp > CURRENT_TIMESTAMP - INTERVAL '1 day' * p_days;
END;
$$ LANGUAGE plpgsql;

-- Create function to clean up old data
CREATE OR REPLACE FUNCTION cleanup_old_data()
RETURNS void AS $$
BEGIN
    -- Delete vitals older than 90 days
    DELETE FROM vitals WHERE created_at < CURRENT_TIMESTAMP - INTERVAL '90 days';
    
    -- Delete resolved alerts older than 1 year
    DELETE FROM alerts WHERE resolved = true AND resolved_at < CURRENT_TIMESTAMP - INTERVAL '1 year';
    
    -- Delete attendance records older than 3 years
    DELETE FROM attendance WHERE date < CURRENT_DATE - INTERVAL '3 years';
    
    -- Update statistics
    ANALYZE;
END;
$$ LANGUAGE plpgsql;

-- Create roles and permissions
CREATE ROLE iot_app_user;
GRANT SELECT, INSERT, UPDATE ON users, devices, vitals, alerts, attendance TO iot_app_user;
GRANT SELECT ON user_device_summary, latest_vitals, daily_attendance_summary, alert_statistics TO iot_app_user;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO iot_app_user;

CREATE ROLE iot_readonly;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO iot_readonly;
GRANT SELECT ON ALL VIEWS IN SCHEMA public TO iot_readonly;

-- Insert sample data (for development/testing)
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

-- Create scheduled job for cleanup (requires pg_cron extension)
-- SELECT cron.schedule('cleanup-old-data', '0 2 * * *', 'SELECT cleanup_old_data();');

COMMIT;