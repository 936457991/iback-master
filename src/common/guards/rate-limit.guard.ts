import { Injectable, CanActivate, ExecutionContext, HttpException, HttpStatus } from '@nestjs/common';
import { Request } from 'express';

/**
 * 简单的内存型请求频率限制守卫
 * 防止暴力破解和DDoS攻击
 */
@Injectable()
export class RateLimitGuard implements CanActivate {
  // 存储每个IP的请求记录: IP -> [时间戳数组]
  private requestMap = new Map<string, number[]>();
  
  // 存储被封禁的IP: IP -> 解封时间戳
  private bannedIPs = new Map<string, number>();
  
  // 配置
  private readonly config = {
    // 时间窗口（毫秒）
    windowMs: 15 * 60 * 1000, // 15分钟
    // 时间窗口内最大请求数
    maxRequests: 100, // 15分钟内最多100次（开发友好配置）
    // IP封禁时长（毫秒）
    banDuration: 30 * 60 * 1000, // 封禁30分钟
    // 触发封禁的失败次数
    maxFailures: 200, // 200次失败后封禁（与maxRequests成比例）
  };

  constructor() {
    // 每5分钟清理一次过期的记录
    setInterval(() => {
      this.cleanupExpiredRecords();
    }, 5 * 60 * 1000);
  }

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const ip = this.getClientIP(request);
    const now = Date.now();

    // 检查是否被封禁
    const bannedUntil = this.bannedIPs.get(ip);
    if (bannedUntil && now < bannedUntil) {
      const remainingMinutes = Math.ceil((bannedUntil - now) / 60000);
      console.warn(`🚫 Blocked request from banned IP: ${ip}, remaining: ${remainingMinutes} minutes`);
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message: `您的IP已被临时封禁，请在 ${remainingMinutes} 分钟后重试`,
          code: 'IP_BANNED',
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    // 如果封禁时间已过，移除封禁记录
    if (bannedUntil && now >= bannedUntil) {
      this.bannedIPs.delete(ip);
      console.log(`✅ IP unbanned: ${ip}`);
    }

    // 获取该IP的请求历史
    let requests = this.requestMap.get(ip) || [];
    
    // 清除时间窗口外的请求
    const windowStart = now - this.config.windowMs;
    requests = requests.filter(timestamp => timestamp > windowStart);

    // 检查是否超过频率限制
    if (requests.length >= this.config.maxRequests) {
      // 增加失败计数，可能触发封禁
      this.handleRateLimitExceeded(ip, requests.length);
      
      const oldestRequest = requests[0];
      const resetTime = new Date(oldestRequest + this.config.windowMs);
      const remainingMinutes = Math.ceil((resetTime.getTime() - now) / 60000);
      
      console.warn(`⚠️ Rate limit exceeded for IP: ${ip}, requests: ${requests.length}/${this.config.maxRequests}`);
      
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message: `请求过于频繁，请在 ${remainingMinutes} 分钟后重试`,
          code: 'RATE_LIMIT_EXCEEDED',
          retryAfter: resetTime.toISOString(),
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    // 记录本次请求
    requests.push(now);
    this.requestMap.set(ip, requests);

    console.log(`✅ Request allowed for IP: ${ip}, count: ${requests.length}/${this.config.maxRequests} in ${this.config.windowMs / 60000} minutes`);
    
    return true;
  }

  /**
   * 处理超过频率限制的情况
   */
  private handleRateLimitExceeded(ip: string, requestCount: number): void {
    // 如果请求次数远超限制，直接封禁IP
    if (requestCount >= this.config.maxFailures) {
      const bannedUntil = Date.now() + this.config.banDuration;
      this.bannedIPs.set(ip, bannedUntil);
      
      console.error(`🚫 IP BANNED due to excessive requests: ${ip}, requests: ${requestCount}, banned for ${this.config.banDuration / 60000} minutes`);
      
      // 清除该IP的请求历史
      this.requestMap.delete(ip);
    }
  }

  /**
   * 获取客户端真实IP
   * 支持代理和负载均衡器
   */
  private getClientIP(request: Request): string {
    // 尝试从各种header中获取真实IP
    const xForwardedFor = request.headers['x-forwarded-for'];
    const xRealIP = request.headers['x-real-ip'];
    const cfConnectingIP = request.headers['cf-connecting-ip']; // Cloudflare
    
    if (typeof xForwardedFor === 'string') {
      // x-forwarded-for 可能包含多个IP，取第一个
      return xForwardedFor.split(',')[0].trim();
    }
    
    if (typeof xRealIP === 'string') {
      return xRealIP;
    }
    
    if (typeof cfConnectingIP === 'string') {
      return cfConnectingIP;
    }
    
    // 使用连接的远程地址
    return request.ip || request.socket.remoteAddress || 'unknown';
  }

  /**
   * 清理过期的请求记录
   */
  private cleanupExpiredRecords(): void {
    const now = Date.now();
    const windowStart = now - this.config.windowMs;
    let cleanedIPs = 0;
    let cleanedBans = 0;

    // 清理请求记录
    for (const [ip, requests] of this.requestMap.entries()) {
      const validRequests = requests.filter(timestamp => timestamp > windowStart);
      
      if (validRequests.length === 0) {
        this.requestMap.delete(ip);
        cleanedIPs++;
      } else if (validRequests.length < requests.length) {
        this.requestMap.set(ip, validRequests);
      }
    }

    // 清理过期的封禁记录
    for (const [ip, bannedUntil] of this.bannedIPs.entries()) {
      if (now >= bannedUntil) {
        this.bannedIPs.delete(ip);
        cleanedBans++;
      }
    }

    if (cleanedIPs > 0 || cleanedBans > 0) {
      console.log(`🧹 Cleanup completed: removed ${cleanedIPs} expired IP records, ${cleanedBans} expired bans`);
    }

    // 输出当前状态
    console.log(`📊 Rate limit status: ${this.requestMap.size} tracked IPs, ${this.bannedIPs.size} banned IPs`);
  }

  /**
   * 获取当前统计信息（用于监控）
   */
  getStats() {
    return {
      trackedIPs: this.requestMap.size,
      bannedIPs: this.bannedIPs.size,
      config: this.config,
    };
  }
}

