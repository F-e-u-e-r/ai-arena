// 極簡、零相依的 JSON Schema (draft-07 子集) 驗證器。
// 支援關鍵字：type、required、properties、enum、minimum、minLength、format(date-time)。
// 未知關鍵字一律忽略（這正是 draft-07 的標準行為），所以 schema/*.json 仍是
// 完整的 JSON Schema、可被編輯器（VS Code 等）用來做即時驗證與自動完成，
// 而 build 階段只強制它看得懂的那個子集。回傳人類可讀的錯誤字串陣列（空 = 通過）。
//
// 注意：JSON.parse 對過大的數字（例如 1e999）會回 Infinity，所以 number 型別
// 仍必須明確檢查有限性，不能只靠 typeof。

function typeOf(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

function matchesType(value, type) {
  if (type === 'integer') return typeof value === 'number' && Number.isInteger(value);
  if (type === 'number') return typeof value === 'number';
  if (type === 'object') return typeOf(value) === 'object';
  if (type === 'array') return Array.isArray(value);
  return typeOf(value) === type; // string / boolean / null
}

export function validate(schema, data, path = '') {
  const errors = [];
  const at = path || '(root)';

  if (Array.isArray(schema.enum) && !schema.enum.some(candidate => candidate === data)) {
    errors.push(`${at}: 必須是 ${JSON.stringify(schema.enum)} 其中之一（收到 ${JSON.stringify(data)}）`);
    return errors; // enum 不符就沒必要再往下檢查這個節點
  }

  if (schema.type && !matchesType(data, schema.type)) {
    errors.push(`${at}: 型別應為 ${schema.type}，但收到 ${typeOf(data)}`);
    return errors; // 型別錯了，後續的 property/minimum 檢查沒有意義
  }

  if ((schema.type === 'number' || schema.type === 'integer')
      && typeof data === 'number' && !Number.isFinite(data)) {
    errors.push(`${at}: 必須是有限數字（收到 ${data}）`);
    return errors; // 非有限值再往下比 minimum 沒有意義
  }

  if (schema.format === 'date-time' && typeof data === 'string') {
    // RFC3339 date-time：必須有日期 + T + 時間 + Z/時區位移。單靠 Date.parse 會誤放
    // 純日期（2026-07-05）這類值，所以先用 regex 卡形狀，再用 Date.parse 卡真實性。
    const rfc3339 = /^\d{4}-\d{2}-\d{2}[Tt]\d{2}:\d{2}:\d{2}(\.\d+)?([Zz]|[+-]\d{2}:\d{2})$/;
    if (!rfc3339.test(data) || Number.isNaN(Date.parse(data))) {
      errors.push(`${at}: 不是合法的 date-time（應為 RFC3339，例如 2026-07-05T06:32:00Z）`);
    }
  }

  if (typeof schema.minLength === 'number' && typeof data === 'string' && data.length < schema.minLength) {
    errors.push(`${at}: 至少需要 ${schema.minLength} 個字元（不可為空）`);
  }

  if (typeof schema.minimum === 'number' && typeof data === 'number' && data < schema.minimum) {
    errors.push(`${at}: 必須 >= ${schema.minimum}（收到 ${data}）`);
  }

  if (typeOf(data) === 'object') {
    for (const key of schema.required || []) {
      if (!(key in data)) errors.push(`${at}: 缺少必填欄位 "${key}"`);
    }
    if (schema.properties) {
      for (const [key, subSchema] of Object.entries(schema.properties)) {
        if (key in data) {
          errors.push(...validate(subSchema, data[key], path ? `${path}.${key}` : key));
        }
      }
    }
  }

  return errors;
}
