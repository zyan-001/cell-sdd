'use strict';

const KEBAB_CASE = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;
const DELTA_PREFIX = /^delta-/;
const VALID_MODULES = ['intent', 'plan', 'contract', 'test', 'depends_on'];
const HTTP_METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD']);

// 从 depends_on 元素中提取 id 字符串
// 兼容两种格式: "cell-id" 或 { id: "cell-id", kind: "..." }
function extractDepId(dep) {
  if (typeof dep === 'string') return dep;
  if (dep && typeof dep === 'object' && typeof dep.id === 'string') return dep.id;
  return null;
}

// 校验 depends_on 数组中的单个元素
function validateDepItem(item, index) {
  if (typeof item === 'string') {
    if (!KEBAB_CASE.test(item)) {
      return `depends_on[${index}]: 字符串格式必须是 kebab-case`;
    }
    return null;
  }
  if (item && typeof item === 'object') {
    if (!item.id || typeof item.id !== 'string') {
      return `depends_on[${index}]: 对象格式必须包含 id 字段（非空字符串）`;
    }
    if (!KEBAB_CASE.test(item.id)) {
      return `depends_on[${index}].id: 必须是 kebab-case 格式`;
    }
    if (item.kind !== undefined && (typeof item.kind !== 'string' || item.kind.length === 0)) {
      return `depends_on[${index}].kind: 如提供则必须是非空字符串`;
    }
    return null;
  }
  return `depends_on[${index}]: 必须是字符串或包含 id 的对象`;
}

function validateDependsOn(dependsOn) {
  if (!Array.isArray(dependsOn)) {
    return ['depends_on: 必须是数组'];
  }
  const errors = [];
  dependsOn.forEach((item, i) => {
    const err = validateDepItem(item, i);
    if (err) errors.push(err);
  });
  return errors;
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function validateInterfaceField(field, path, errors) {
  if (!field || typeof field !== 'object') {
    errors.push(`${path}: 必须是对象`);
    return;
  }
  if (!isNonEmptyString(field.name)) {
    errors.push(`${path}.name: 必须是非空字符串`);
  }
  if (!isNonEmptyString(field.type)) {
    errors.push(`${path}.type: 必须是非空字符串`);
  }
  if (field.required !== undefined && typeof field.required !== 'boolean') {
    errors.push(`${path}.required: 如提供则必须是布尔值`);
  }
  if (field.description !== undefined && typeof field.description !== 'string') {
    errors.push(`${path}.description: 如提供则必须是字符串`);
  }
}

function validateFieldArray(value, path, errors) {
  if (value === undefined) return;
  if (!Array.isArray(value)) {
    errors.push(`${path}: 如提供则必须是数组`);
    return;
  }
  value.forEach((field, i) => validateInterfaceField(field, `${path}[${i}]`, errors));
}

function validateErrorItem(item, path, errors) {
  if (!item || typeof item !== 'object') {
    errors.push(`${path}: 必须是对象`);
    return;
  }
  if (!Number.isInteger(item.status) || item.status < 100 || item.status > 599) {
    errors.push(`${path}.status: 必须是 100-599 的整数`);
  }
  if (!isNonEmptyString(item.code)) {
    errors.push(`${path}.code: 必须是非空字符串`);
  }
  if (!isNonEmptyString(item.message)) {
    errors.push(`${path}.message: 必须是非空字符串`);
  }
}

function validateContractV2Item(item, index, errors) {
  const prefix = `contract[${index}]`;
  if (!item || typeof item !== 'object') {
    errors.push(`${prefix}: 必须是对象`);
    return;
  }

  if (!item.api || typeof item.api !== 'object') {
    errors.push(`${prefix}.api: 必须是对象`);
  } else {
    if (!isNonEmptyString(item.api.name)) {
      errors.push(`${prefix}.api.name: 必须是非空字符串`);
    }
    if (!isNonEmptyString(item.api.method)) {
      errors.push(`${prefix}.api.method: 必须是非空字符串`);
    } else if (!HTTP_METHODS.has(item.api.method.toUpperCase())) {
      errors.push(`${prefix}.api.method: 必须是有效 HTTP 方法`);
    }
    if (!isNonEmptyString(item.api.path)) {
      errors.push(`${prefix}.api.path: 必须是非空字符串`);
    }
  }

  if (!item.request || typeof item.request !== 'object') {
    errors.push(`${prefix}.request: 必须是对象`);
  } else {
    validateFieldArray(item.request.params, `${prefix}.request.params`, errors);
    validateFieldArray(item.request.query, `${prefix}.request.query`, errors);
    validateFieldArray(item.request.headers, `${prefix}.request.headers`, errors);
    validateFieldArray(item.request.body, `${prefix}.request.body`, errors);
  }

  if (!item.response || typeof item.response !== 'object') {
    errors.push(`${prefix}.response: 必须是对象`);
  } else {
    if (!Number.isInteger(item.response.status) || item.response.status < 100 || item.response.status > 599) {
      errors.push(`${prefix}.response.status: 必须是 100-599 的整数`);
    }
    validateFieldArray(item.response.headers, `${prefix}.response.headers`, errors);
    validateFieldArray(item.response.body, `${prefix}.response.body`, errors);
  }

  if (item.errors !== undefined) {
    if (!Array.isArray(item.errors)) {
      errors.push(`${prefix}.errors: 如提供则必须是数组`);
    } else {
      item.errors.forEach((err, i) => validateErrorItem(err, `${prefix}.errors[${i}]`, errors));
    }
  }
}

function isLegacyContractItem(item) {
  return item && typeof item === 'object' && isNonEmptyString(item.when) && isNonEmptyString(item.then);
}

// create/update 兼容旧版 when/then，同时支持 ContractV2
function validateContractV2(contract) {
  const errors = [];
  if (!Array.isArray(contract) || contract.length === 0) {
    return ['contract: 必须是非空数组'];
  }
  contract.forEach((item, i) => {
    if (isLegacyContractItem(item)) {
      // 兼容历史格式：{ when, then }
      return;
    }
    validateContractV2Item(item, i, errors);
  });
  return errors;
}

function validateCell(data) {
  const errors = [];

  if (!data.id || typeof data.id !== 'string') {
    errors.push('id: 必须是非空字符串');
  } else if (!KEBAB_CASE.test(data.id)) {
    errors.push('id: 必须是 kebab-case 格式（小写字母开头，仅含小写字母、数字和连字符）');
  }

  if (!data.intent || typeof data.intent !== 'string') {
    errors.push('intent: 必须是非空字符串');
  }

  if (!data.plan || typeof data.plan !== 'string') {
    errors.push('plan: 必须是非空字符串');
  }

  errors.push(...validateContractV2(data.contract));

  if (!Array.isArray(data.test) || data.test.length === 0) {
    errors.push('test: 必须是非空数组');
  } else {
    data.test.forEach((item, i) => {
      if (!item.scenario || !item.given || !item.when || !item.then) {
        errors.push(`test[${i}]: 必须包含 scenario, given, when, then 字段`);
      }
    });
  }

  if (data.depends_on !== undefined) {
    errors.push(...validateDependsOn(data.depends_on));
  }

  // 可选字段: kind
  if (data.kind !== undefined && (typeof data.kind !== 'string' || data.kind.length === 0)) {
    errors.push('kind: 如提供则必须是非空字符串');
  }

  // 可选字段: tags
  if (data.tags !== undefined) {
    if (!Array.isArray(data.tags)) {
      errors.push('tags: 如提供则必须是字符串数组');
    } else {
      data.tags.forEach((tag, i) => {
        if (typeof tag !== 'string' || tag.length === 0) {
          errors.push(`tags[${i}]: 必须是非空字符串`);
        }
      });
    }
  }

  // 可选字段: entity
  if (data.entity !== undefined && (typeof data.entity !== 'string' || data.entity.length === 0)) {
    errors.push('entity: 如提供则必须是非空字符串');
  }

  return errors.length === 0
    ? { valid: true }
    : { valid: false, errors };
}

function validateDelta(data) {
  const errors = [];

  if (!data.id || typeof data.id !== 'string') {
    errors.push('id: 必须是非空字符串');
  } else if (!DELTA_PREFIX.test(data.id)) {
    errors.push('id: 必须以 "delta-" 开头');
  }

  if (!data.target || typeof data.target !== 'string') {
    errors.push('target: 必须是非空字符串');
  }

  if (!data.intent || typeof data.intent !== 'string') {
    errors.push('intent: 必须是非空字符串');
  }

  if (!data.plan || typeof data.plan !== 'string') {
    errors.push('plan: 必须是非空字符串');
  }

  errors.push(...validateContractV2(data.contract));

  if (!Array.isArray(data.test) || data.test.length === 0) {
    errors.push('test: 必须是非空数组');
  } else {
    data.test.forEach((item, i) => {
      if (!item.scenario || !item.given || !item.when || !item.then) {
        errors.push(`test[${i}]: 必须包含 scenario, given, when, then 字段`);
      }
    });
  }

  if (data.depends_on !== undefined) {
    errors.push(...validateDependsOn(data.depends_on));
  }

  return errors.length === 0
    ? { valid: true }
    : { valid: false, errors };
}

function validateModule(module, data) {
  const errors = [];

  if (!VALID_MODULES.includes(module)) {
    errors.push(`module: 必须是 ${VALID_MODULES.join(', ')} 之一`);
    return { valid: false, errors };
  }

  if (module === 'intent' || module === 'plan') {
    if (typeof data !== 'string' || data.length === 0) {
      errors.push(`${module}: 必须是非空字符串`);
    }
  } else if (module === 'contract') {
    errors.push(...validateContractV2(data));
  } else if (module === 'test') {
    if (!Array.isArray(data) || data.length === 0) {
      errors.push('test: 必须是非空数组');
    } else {
      data.forEach((item, i) => {
        if (!item.scenario || !item.given || !item.when || !item.then) {
          errors.push(`test[${i}]: 必须包含 scenario, given, when, then 字段`);
        }
      });
    }
  } else if (module === 'depends_on') {
    errors.push(...validateDependsOn(data));
  }

  return errors.length === 0
    ? { valid: true }
    : { valid: false, errors };
}

function validateEntity(data) {
  const errors = [];

  if (!data.name || typeof data.name !== 'string') {
    errors.push('name: 必须是非空字符串');
  }

  if (data.attributes !== undefined) {
    if (!Array.isArray(data.attributes)) {
      errors.push('attributes: 如提供则必须是数组');
    } else {
      data.attributes.forEach((attr, i) => {
        if (!attr.name || typeof attr.name !== 'string') {
          errors.push(`attributes[${i}]: 必须包含 name 字段（非空字符串）`);
        }
        if (!attr.type || typeof attr.type !== 'string') {
          errors.push(`attributes[${i}]: 必须包含 type 字段（非空字符串）`);
        }
      });
    }
  }

  if (data.capabilities !== undefined && !Array.isArray(data.capabilities)) {
    errors.push('capabilities: 如提供则必须是数组');
  }

  if (data.states !== undefined && !Array.isArray(data.states)) {
    errors.push('states: 如提供则必须是数组');
  }

  if (data.transitions !== undefined && !Array.isArray(data.transitions)) {
    errors.push('transitions: 如提供则必须是数组');
  }

  if (data.relations !== undefined && !Array.isArray(data.relations)) {
    errors.push('relations: 如提供则必须是数组');
  }

  return errors.length === 0
    ? { valid: true }
    : { valid: false, errors };
}

module.exports = { validateCell, validateDelta, validateModule, validateDependsOn, extractDepId, VALID_MODULES, validateEntity };
