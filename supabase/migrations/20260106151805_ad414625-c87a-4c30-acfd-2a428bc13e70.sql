-- Migrate existing 'all' permissions to 'edit'
UPDATE user_permissions 
SET permission = 'edit' 
WHERE permission = 'all';