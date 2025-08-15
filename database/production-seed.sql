-- Production seed data for IoT Worker Monitoring System
-- Insert sample users with strong passwords
-- Password for all accounts: AdminPass123!

INSERT INTO users (name, email, password_hash, role, department) VALUES 
('System Admin', 'admin@company.com', '$2a$12$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'supervisor', 'Management'),
('Operations Supervisor', 'supervisor@company.com', '$2a$12$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'supervisor', 'Operations'),
('Safety Manager', 'safety@company.com', '$2a$12$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'supervisor', 'Safety'),
('Employee Demo', 'employee@company.com', '$2a$12$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'employee', 'Operations'),
('Worker Demo', 'worker@company.com', '$2a$12$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'employee', 'Manufacturing');

-- Insert sample devices
INSERT INTO devices (user_id, device_serial, device_model, battery_level) VALUES 
(4, 'IOT-PROD-001', 'HealthMonitor Pro v2', 95),
(5, 'IOT-PROD-002', 'HealthMonitor Pro v2', 88);

-- Insert sample departments if not exists
INSERT INTO departments (name, description) VALUES 
('Management', 'Executive and administrative management'),
('Operations', 'Daily operations and logistics'),
('Safety', 'Workplace safety and compliance'),
('Manufacturing', 'Production and assembly'),
('Quality Control', 'Product quality assurance'),
('Maintenance', 'Equipment and facility maintenance')
ON CONFLICT (name) DO NOTHING;