#!/bin/bash
# 资源使用情况检查脚本

echo "==================== 系统资源使用情况 ===================="
echo ""

echo "📊 CPU 使用率："
top -l 1 | grep "CPU usage" || echo "无法获取 CPU 信息"
echo ""

echo "💾 内存使用："
top -l 1 | grep "PhysMem" || echo "无法获取内存信息"
echo ""

echo "📁 磁盘使用："
df -h | grep -E "Filesystem|/$" || df -h
echo ""

echo "🔌 进程信息 (Node.js)："
ps aux | grep -E "PID|node" | grep -v grep || echo "未找到 Node.js 进程"
echo ""

echo "🌐 网络连接数："
netstat -an | grep ESTABLISHED | wc -l || echo "无法获取网络连接信息"
echo ""

echo "==================== 日志错误统计 ===================="
echo ""

echo "📝 最近的错误日志数量："
if [ -d "logs" ]; then
  echo "总错误日志行数: $(cat logs/error-*.log 2>/dev/null | wc -l)"
  echo ""
  echo "request aborted 错误数量: $(grep -r "request aborted" logs/ 2>/dev/null | wc -l)"
  echo ""
  echo "最近 100 条错误的时间分布:"
  tail -100 logs/error-*.log 2>/dev/null | grep -o "^[0-9T:-]*" | cut -d'T' -f1 | sort | uniq -c || echo "无法统计"
else
  echo "logs 目录不存在"
fi
echo ""

echo "==================== 数据库连接测试 ===================="
echo ""
echo "测试数据库连接速度..."
time node -e "
const mysql = require('mysql2/promise');
(async () => {
  try {
    const connection = await mysql.createConnection({
      host: process.env.DB_HOST || 'gondola.proxy.rlwy.net',
      port: process.env.DB_PORT || 39395,
      user: process.env.DB_USERNAME || 'root',
      password: process.env.DB_PASSWORD || 'aspFqYqTuBJyeNrfTDKcRAKuYBEuQyeB',
      database: process.env.DB_DATABASE || 'railway',
      ssl: { rejectUnauthorized: false }
    });
    console.log('✅ 数据库连接成功');
    await connection.end();
  } catch (error) {
    console.log('❌ 数据库连接失败:', error.message);
  }
})();
" 2>&1 || echo "❌ 无法测试数据库连接（可能缺少 mysql2 包）"

echo ""
echo "==================== 检查完成 ===================="

