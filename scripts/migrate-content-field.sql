-- 数据库迁移脚本：将房间内容字段从TEXT改为LONGTEXT
-- 执行前请备份数据库！

USE interview_system;

-- 检查当前表结构
DESCRIBE rooms;

-- 修改content字段类型为LONGTEXT以支持更大内容
ALTER TABLE rooms MODIFY COLUMN content LONGTEXT;

-- 验证修改结果
DESCRIBE rooms;

-- 显示修改完成信息
SELECT 'Content field migration completed. LONGTEXT can store up to 4GB of text data.' as status;
