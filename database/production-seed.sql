-- Production seed data for IoT Worker Monitoring System
-- Insert sample users with strong passwords
-- Password for all accounts: AdminPass123!

INSERT INTO users (name, email, password_hash, role, department, phone, emergency_contact_name, emergency_contact_phone) VALUES 
('System Admin', 'admin@company.com', '$2a$12$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'supervisor', 'Management', '+1-555-0001', 'Emergency Line', '+1-911-0000'),
('Operations Supervisor', 'supervisor@company.com', '$2a$12$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'supervisor', 'Operations', '+1-555-0002', 'Sarah Johnson', '+1-555-0102'),
('Safety Manager', 'safety@company.com', '$2a$12$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'supervisor', 'Safety', '+1-555-0003', 'Mike Davis', '+1-555-0103'),

-- Real Employees (12 total)
('Alice Johnson', 'alice.johnson@company.com', '$2a$12$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'employee', 'Manufacturing', '+1-555-1001', 'Bob Johnson', '+1-555-2001'),
('Bob Smith', 'bob.smith@company.com', '$2a$12$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'employee', 'Manufacturing', '+1-555-1002', 'Alice Smith', '+1-555-2002'),
('Carol Davis', 'carol.davis@company.com', '$2a$12$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'employee', 'Quality Control', '+1-555-1003', 'John Davis', '+1-555-2003'),
('David Wilson', 'david.wilson@company.com', '$2a$12$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'employee', 'Warehouse', '+1-555-1004', 'Emma Wilson', '+1-555-2004'),
('Emma Brown', 'emma.brown@company.com', '$2a$12$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'employee', 'Logistics', '+1-555-1005', 'David Brown', '+1-555-2005'),
('Frank Garcia', 'frank.garcia@company.com', '$2a$12$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'employee', 'Maintenance', '+1-555-1006', 'Sofia Garcia', '+1-555-2006'),
('Grace Martinez', 'grace.martinez@company.com', '$2a$12$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'employee', 'Security', '+1-555-1007', 'Luis Martinez', '+1-555-2007'),
('Henry Lee', 'henry.lee@company.com', '$2a$12$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'employee', 'Manufacturing', '+1-555-1008', 'Anna Lee', '+1-555-2008'),
('Ivy Chen', 'ivy.chen@company.com', '$2a$12$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'employee', 'Quality Control', '+1-555-1009', 'Chen Wei', '+1-555-2009'),
('Jack Taylor', 'jack.taylor@company.com', '$2a$12$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'employee', 'Warehouse', '+1-555-1010', 'Mary Taylor', '+1-555-2010'),
('Kate Anderson', 'kate.anderson@company.com', '$2a$12$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'employee', 'Logistics', '+1-555-1011', 'Tom Anderson', '+1-555-2011'),
('Liam Rodriguez', 'liam.rodriguez@company.com', '$2a$12$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'employee', 'Maintenance', '+1-555-1012', 'Maria Rodriguez', '+1-555-2012');

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

-- Insert sample departments if not exists
INSERT INTO departments (name, description) VALUES 
('Management', 'Executive and administrative management'),
('Operations', 'Daily operations and logistics'),
('Safety', 'Workplace safety and compliance'),
('Manufacturing', 'Production and assembly'),
('Quality Control', 'Product quality assurance'),
('Maintenance', 'Equipment and facility maintenance')
ON CONFLICT (name) DO NOTHING;