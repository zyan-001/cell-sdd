'use strict';

const KEBAB_CASE = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;
const DELTA_PREFIX = /^delta-/;
const VALID_MODULES = ['intent', 'plan', 'contract', 'test', 'depends_on', 'schema', 'states', 'invariants', 'requires_state'];
const HTTP_METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD']);
const MODULES_BY_KIND = {
  Aggregate: new Set(['intent', 'depends_on', 'schema', 'states', 'invariants']),
  Action: new Set(['intent', 'depends_on', 'plan', 'contract', 'test', 'requires_state']),
  Journey: new Set(['intent', 'depends_on', 'plan', 'test']),
};

// 从 depends_on 元素中提取 id 字符串
function extractDepId(dep) {
  if (typeof dep === 'string') return dep;
  if (dep && typeof dep === 'object' && typeof dep.id === 'string') return dep.id;
  return null;
}

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

function validateContractV2(contract) {
  const errors = [];
  if (!Array.isArray(contract) || contract.length === 0) {
    return ['contract: 必须是非空数组'];
  }
  contract.forEach((item, i) => {
    if (isLegacyContractItem(item)) {
      return;
    }
    validateContractV2Item(item, i, errors);
  });
  return errors;
}

function validateRequiresState(requiresState) {
  if (!Array.isArray(requiresState)) return ['requires_state: 必须是数组'];
  const errors = [];
  requiresState.forEach((item, i) => {
    if (!item || typeof item !== 'object') {
      errors.push(`requires_state[${i}]: 必须是对象`);
      return;
    }
    if (!isNonEmptyString(item.target)) errors.push(`requires_state[${i}].target: 必须是非空字符串`);
    if (!isNonEmptyString(item.field)) errors.push(`requires_state[${i}].field: 必须是非空字符串`);
    if (item.type !== 'schema' && item.type !== 'state') {
      errors.push(`requires_state[${i}].type: 必须是 'schema' 或 'state'`);
    }
  });
  return errors;
}

function validateSchema(schema) {
  if (!Array.isArray(schema)) return ['schema: 必须是数组'];
  const errors = [];
  schema.forEach((item, i) => {
    if (!item || typeof item !== 'object') {
      errors.push(`schema[${i}]: 必须是对象`);
      return;
    }
    if (!isNonEmptyString(item.name)) errors.push(`schema[${i}].name: 必须是非空字符串`);
    if (!isNonEmptyString(item.type)) errors.push(`schema[${i}].type: 必须是非空字符串`);
  });
  return errors;
}

function validateStates(states) {
  if (!Array.isArray(states)) return ['states: 必须是数组'];
  const errors = [];
  states.forEach((item, i) => {
    if (!item || typeof item !== 'object') {
      errors.push(`states[${i}]: 必须是对象`);
      return;
    }
    if (!isNonEmptyString(item.name)) errors.push(`states[${i}].name: 必须是非空字符串`);
  });
  return errors;
}

function validateInvariants(invariants) {
  if (!Array.isArray(invariants)) return ['invariants: 必须是数组'];
  const errors = [];
  invariants.forEach((item, i) => {
    if (!isNonEmptyString(item)) errors.push(`invariants[${i}]: 必须是非空字符串`);
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

  if (!data.kind || !['Aggregate', 'Action', 'Journey'].includes(data.kind)) {
    errors.push('kind: 必须是 Aggregate, Action 或 Journey 之一');
  } else {
    if (data.kind === 'Aggregate') {
      if (data.schema !== undefined) errors.push(...validateSchema(data.schema));
      if (data.states !== undefined) errors.push(...validateStates(data.states));
      if (data.invariants !== undefined) errors.push(...validateInvariants(data.invariants));
      if (data.contract !== undefined) errors.push('Aggregate Cell 不应包含 contract 模块');
      if (data.plan !== undefined) errors.push('Aggregate Cell 不应包含 plan 模块');
      if (data.test !== undefined) errors.push('Aggregate Cell 不应包含 test 模块');
      if (data.requires_state !== undefined) errors.push('Aggregate Cell 不应包含 requires_state 模块');
    } else if (data.kind === 'Action') {
      if (!data.plan || typeof data.plan !== 'string') errors.push('plan: 必须是非空字符串');
      if (data.contract !== undefined) errors.push(...validateContractV2(data.contract));
      else errors.push('contract: 必须提供');
      if (!Array.isArray(data.test) || data.test.length === 0) errors.push('test: 必须是非空数组');
      else data.test.forEach((item, i) => { if (!item.scenario || !item.given || !item.when || !item.then) errors.push(`test[${i}]: 必须包含 scenario, given, when, then 字段`); });
      if (data.requires_state !== undefined) errors.push(...validateRequiresState(data.requires_state));
      if (data.schema !== undefined) errors.push('Action Cell 不应包含 schema 模块');
      if (data.states !== undefined) errors.push('Action Cell 不应包含 states 模块');
      if (data.invariants !== undefined) errors.push('Action Cell 不应包含 invariants 模块');
    } else if (data.kind === 'Journey') {
      if (!data.plan || typeof data.plan !== 'string') errors.push('plan: 必须是非空字符串');
      if (!Array.isArray(data.test) || data.test.length === 0) errors.push('test: 必须是非空数组');
      else data.test.forEach((item, i) => { if (!item.scenario || !item.given || !item.when || !item.then) errors.push(`test[${i}]: 必须包含 scenario, given, when, then 字段`); });
      if (data.contract !== undefined) errors.push('Journey Cell 不应包含 contract 模块');
      if (data.schema !== undefined) errors.push('Journey Cell 不应包含 schema 模块');
      if (data.states !== undefined) errors.push('Journey Cell 不应包含 states 模块');
      if (data.invariants !== undefined) errors.push('Journey Cell 不应包含 invariants 模块');
      if (data.requires_state !== undefined) errors.push('Journey Cell 不应包含 requires_state 模块');
    }
  }

  if (data.depends_on !== undefined) {
    errors.push(...validateDependsOn(data.depends_on));
  }

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

  if (data.plan !== undefined && typeof data.plan !== 'string') {
    errors.push('plan: 必须是非空字符串');
  }

  if (data.contract !== undefined) {
    errors.push(...validateContractV2(data.contract));
  }

  if (data.test !== undefined) {
    if (!Array.isArray(data.test) || data.test.length === 0) {
      errors.push('test: 必须是非空数组');
    } else {
      data.test.forEach((item, i) => {
        if (!item.scenario || !item.given || !item.when || !item.then) {
          errors.push(`test[${i}]: 必须包含 scenario, given, when, then 字段`);
        }
      });
    }
  }

  if (data.schema !== undefined) {
    errors.push(...validateSchema(data.schema));
  }

  if (data.states !== undefined) {
    errors.push(...validateStates(data.states));
  }

  if (data.invariants !== undefined) {
    errors.push(...validateInvariants(data.invariants));
  }

  if (data.requires_state !== undefined) {
    errors.push(...validateRequiresState(data.requires_state));
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
  } else if (module === 'schema') {
    errors.push(...validateSchema(data));
  } else if (module === 'states') {
    errors.push(...validateStates(data));
  } else if (module === 'invariants') {
    errors.push(...validateInvariants(data));
  } else if (module === 'requires_state') {
    errors.push(...validateRequiresState(data));
  }

  return errors.length === 0
    ? { valid: true }
    : { valid: false, errors };
}

function validateModuleForKind(kind, module) {
  const modules = MODULES_BY_KIND[kind];
  if (!modules) {
    return { valid: false, errors: [`kind: 不支持的 Cell 类型 ${kind}`] };
  }
  if (!modules.has(module)) {
    return { valid: false, errors: [`${kind} Cell 不允许更新模块 ${module}`] };
  }
  return { valid: true };
}

function validateTerm(data) {
  const errors = [];

  if (!data.term || typeof data.term !== 'string') {
    errors.push('term: 必须是非空字符串');
  }

  if (!data.definition || typeof data.definition !== 'string') {
    errors.push('definition: 必须是非空字符串');
  }

  if (data.aliases !== undefined) {
    if (!Array.isArray(data.aliases)) {
      errors.push('aliases: 如提供则必须是字符串数组');
    } else {
      data.aliases.forEach((alias, i) => {
        if (typeof alias !== 'string' || alias.length === 0) {
          errors.push(`aliases[${i}]: 必须是非空字符串`);
        }
      });
    }
  }

  return errors.length === 0
    ? { valid: true }
    : { valid: false, errors };
}

module.exports = {
  validateCell,
  validateDelta,
  validateModule,
  validateModuleForKind,
  validateDependsOn,
  extractDepId,
  VALID_MODULES,
  validateTerm,
};
