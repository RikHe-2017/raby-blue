/**
 * 存储适配器基类
 * 定义统一的存储接口
 */
export abstract class StorageAdapter {
  /**
   * 获取存储的值
   * @param key 存储键
   * @returns 存储的值，如果不存在则返回 null
   */
  abstract get(key: string): Promise<any>

  /**
   * 设置存储的值
   * @param key 存储键
   * @param value 要存储的值
   */
  abstract set(key: string, value: any): Promise<void>

  /**
   * 批量保存相关配置，供合并导入一次提交多个存储键。
   */
  abstract setMany(values: Record<string, unknown>): Promise<void>
}
