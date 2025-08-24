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
    -- Environmental gas parameters
    co DECIMAL(6,2) CHECK (co >= 0 AND co <= 1000), -- Carbon Monoxide in ppm
    h2s DECIMAL(6,2) CHECK (h2s >= 0 AND h2s <= 100), -- Hydrogen Sulfide in ppm
    ch4 DECIMAL(6,2) CHECK (ch4 >= 0 AND ch4 <= 100), -- Methane in %LEL
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
('Shebin Jose Jacob', 'supervisor@company.com', '$2a$12$PHg0e3GI8N79A5472Qzu2OMjqreRZicvuejee84VUQ0mgqYHrJSFO', 'supervisor', 'Operations', '+1-555-0002', 'Sarah Johnson', '+1-555-0102'),
('Safety Manager', 'safety@company.com', '$2a$12$PHg0e3GI8N79A5472Qzu2OMjqreRZicvuejee84VUQ0mgqYHrJSFO', 'supervisor', 'Safety', '+1-555-0003', 'Mike Davis', '+1-555-0103'),

-- Employees (Starting from ID 4)
('Nekhil Ravi', 'nekhil.ravi@company.com', '$2a$12$PHg0e3GI8N79A5472Qzu2OMjqreRZicvuejee84VUQ0mgqYHrJSFO', 'employee', 'Manufacturing', '+1-555-1001', 'Bob Johnson', '+1-555-2001'),
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

-- =====================================================
-- COMPLIANCE MODULE ADDITION
-- =====================================================

-- Create ENUM types for compliance
CREATE TYPE compliance_type AS ENUM ('safety', 'environmental', 'health', 'equipment', 'training', 'documentation');
CREATE TYPE compliance_status AS ENUM ('compliant', 'non_compliant', 'pending_review', 'in_remediation', 'resolved');
CREATE TYPE risk_level AS ENUM ('low', 'medium', 'high', 'critical');

-- Create compliance_records table
CREATE TABLE compliance_records (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    device_id INTEGER REFERENCES devices(id) ON DELETE CASCADE,
    type compliance_type NOT NULL,
    status compliance_status NOT NULL DEFAULT 'pending_review',
    title VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    regulation_standard VARCHAR(100), -- e.g., 'OSHA 1910.95', 'ISO 45001', 'EPA Clean Air Act'
    threshold_value DECIMAL(10,2), -- The compliance threshold/limit
    measured_value DECIMAL(10,2), -- The actual measured value
    deviation_percentage DECIMAL(5,2), -- Calculated percentage deviation from threshold
    risk_level risk_level NOT NULL DEFAULT 'medium',
    location_lat DECIMAL(10,8), -- Location where compliance issue was detected
    location_lng DECIMAL(11,8),
    corrective_action TEXT, -- Description of corrective action taken/required
    remediation_deadline TIMESTAMP, -- Deadline for remediation
    assigned_to INTEGER REFERENCES users(id), -- User assigned to handle this compliance issue
    reviewed BOOLEAN DEFAULT false,
    reviewed_by INTEGER REFERENCES users(id),
    reviewed_at TIMESTAMP,
    approved BOOLEAN DEFAULT false,
    approved_by INTEGER REFERENCES users(id),
    approved_at TIMESTAMP,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Constraints
    CONSTRAINT compliance_review_consistency CHECK (
        (reviewed = false) OR 
        (reviewed = true AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL)
    ),
    CONSTRAINT compliance_approval_consistency CHECK (
        (approved = false) OR 
        (approved = true AND approved_by IS NOT NULL AND approved_at IS NOT NULL)
    ),
    CONSTRAINT compliance_timestamp_check CHECK (timestamp <= CURRENT_TIMESTAMP + INTERVAL '1 hour')
);

-- Create indexes for compliance performance
CREATE INDEX idx_compliance_user_id ON compliance_records(user_id);
CREATE INDEX idx_compliance_device_id ON compliance_records(device_id);
CREATE INDEX idx_compliance_timestamp ON compliance_records(timestamp DESC);
CREATE INDEX idx_compliance_status ON compliance_records(status);
CREATE INDEX idx_compliance_type ON compliance_records(type);
CREATE INDEX idx_compliance_risk_level ON compliance_records(risk_level);
CREATE INDEX idx_compliance_reviewed ON compliance_records(reviewed, timestamp DESC);
CREATE INDEX idx_compliance_approved ON compliance_records(approved, timestamp DESC);
CREATE INDEX idx_compliance_assigned_to ON compliance_records(assigned_to);
CREATE INDEX idx_compliance_high_risk ON compliance_records(risk_level, timestamp DESC) WHERE risk_level IN ('high', 'critical');
CREATE INDEX idx_compliance_unreviewed ON compliance_records(reviewed, timestamp DESC) WHERE reviewed = false;

-- Create trigger for compliance updated_at
CREATE TRIGGER update_compliance_updated_at 
    BEFORE UPDATE ON compliance_records 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Create view for compliance summary
CREATE VIEW compliance_summary AS
SELECT 
    c.id,
    c.user_id,
    c.device_id,
    c.type,
    c.status,
    c.title,
    c.description,
    c.regulation_standard,
    c.threshold_value,
    c.measured_value,
    c.deviation_percentage,
    c.risk_level,
    c.location_lat,
    c.location_lng,
    c.corrective_action,
    c.remediation_deadline,
    c.reviewed,
    c.approved,
    c.timestamp,
    c.created_at,
    c.updated_at,
    u.name as user_name,
    u.department,
    u.role,
    d.device_serial,
    d.device_model,
    assigned_user.name as assigned_to_name,
    reviewer.name as reviewed_by_name,
    approver.name as approved_by_name,
    CASE 
        WHEN c.remediation_deadline IS NOT NULL AND c.remediation_deadline < CURRENT_TIMESTAMP AND c.status != 'resolved' THEN true
        ELSE false
    END as is_overdue
FROM compliance_records c
LEFT JOIN users u ON c.user_id = u.id
LEFT JOIN devices d ON c.device_id = d.id
LEFT JOIN users assigned_user ON c.assigned_to = assigned_user.id
LEFT JOIN users reviewer ON c.reviewed_by = reviewer.id
LEFT JOIN users approver ON c.approved_by = approver.id;

-- Insert sample compliance data
INSERT INTO compliance_records (
    user_id, device_id, type, status, title, description, 
    regulation_standard, threshold_value, measured_value, risk_level,
    corrective_action, assigned_to
) VALUES 
-- Environmental compliance issues
(4, 1, 'environmental', 'non_compliant', 'CO Level Exceeded', 'Carbon monoxide levels detected above OSHA permissible exposure limit during maintenance work in confined space.', 'OSHA 1910.146', 35.0, 52.0, 'high', 'Immediate area evacuation and ventilation system inspection required', 2),

(5, 2, 'environmental', 'pending_review', 'H2S Detection Alert', 'Hydrogen sulfide detected near processing unit. Requires immediate assessment.', 'OSHA 1910.1000', 20.0, 18.5, 'medium', NULL, 2),

-- Safety compliance
(6, 3, 'safety', 'non_compliant', 'Fall Protection Violation', 'Worker detected working at height without proper fall protection equipment.', 'OSHA 1926.501', 6.0, 12.0, 'critical', 'Mandatory safety retraining and disciplinary action', 3),

(7, 4, 'health', 'compliant', 'Heart Rate Monitoring', 'Employee heart rate within acceptable range during high-stress work period.', 'Company Policy HR-001', 180.0, 165.0, 'low', NULL, NULL),

-- Equipment compliance
(8, 5, 'equipment', 'in_remediation', 'Device Battery Low', 'IoT monitoring device showing critically low battery affecting data transmission reliability.', 'Company Standard EQ-005', 20.0, 12.0, 'medium', 'Schedule immediate battery replacement', 2),

-- Training compliance  
(9, 6, 'training', 'non_compliant', 'Safety Training Expired', 'Employee safety certification expired. Not authorized for hazardous area work.', 'Company Policy TR-101', NULL, NULL, 'high', 'Enroll in next available safety training session', 3),

-- Documentation compliance
(10, 7, 'documentation', 'resolved', 'Incident Report Filed', 'Minor injury incident properly documented and reported within required timeframe.', 'OSHA 1904.7', 24.0, 2.0, 'low', 'Incident report submitted to safety committee', 3),

-- More environmental samples
(11, 8, 'environmental', 'non_compliant', 'Methane Level Warning', 'CH4 levels approaching lower explosive limit in storage area.', 'EPA 40 CFR 60', 25.0, 32.0, 'critical', 'Immediate gas leak investigation and repair', 2),

(12, 9, 'safety', 'pending_review', 'Extended Work Hours', 'Employee worked beyond maximum allowed consecutive hours without mandatory rest period.', 'DOT 49 CFR 395', 14.0, 16.5, 'medium', NULL, 3),

(13, 10, 'health', 'compliant', 'Temperature Monitoring', 'Body temperature readings normal throughout shift in high-temperature environment.', 'NIOSH Criteria Document', 38.5, 37.2, 'low', NULL, NULL);

-- Update some compliance records to show workflow progression
UPDATE compliance_records SET 
    reviewed = true, 
    reviewed_by = 2, 
    reviewed_at = CURRENT_TIMESTAMP - INTERVAL '2 days',
    approved = true,
    approved_by = 1,
    approved_at = CURRENT_TIMESTAMP - INTERVAL '1 day'
WHERE id IN (4, 7, 10);

UPDATE compliance_records SET 
    reviewed = true, 
    reviewed_by = 3, 
    reviewed_at = CURRENT_TIMESTAMP - INTERVAL '1 day'
WHERE id IN (2, 5, 9);

-- Add remediation deadlines for critical and high-risk items
UPDATE compliance_records SET 
    remediation_deadline = CURRENT_TIMESTAMP + INTERVAL '24 hours'
WHERE risk_level = 'critical';

UPDATE compliance_records SET 
    remediation_deadline = CURRENT_TIMESTAMP + INTERVAL '7 days'
WHERE risk_level = 'high';

UPDATE compliance_records SET 
    remediation_deadline = CURRENT_TIMESTAMP + INTERVAL '30 days'
WHERE risk_level = 'medium' AND status = 'non_compliant';

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