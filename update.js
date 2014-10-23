var query = require('mongo-query');

module.exports.wrapClass = wrapClass;
module.exports.wrapObject = wrapObject;

function wrapClass(type, updateMethod, initDeferred) {
  wrapObject(type.prototype, updateMethod);
  return type;
}

function wrapObject(type, updateMethod, initDeferred) {
  type.$set = op($set);
  type.$unset = op(op($unset));
  type.$inc = op($inc);
  type.$pop = op($pop);
  type.$push = op($push);
  type.$pull = op($pull);
  type.$addToSet = op($addToSet);
  type.$pushAll = op($pushAll);
  type.$pullAll = op($pullAll);
  type.$getChanges = getChanges;
  type.$defer = defer;
  type.$undefer = undefer;
  type.$update = update;
  Object.defineProperty(type, '$changes', {value: [], enumerable: false, configurable: true, writable: true});
  Object.defineProperty(type, '$deferred', {value: initDeferred, enumerable: false, configurable: true, writable: true});
  return type;

  function op(_op) {
    return function (key, value) {
      var qq = pair(_op, (typeof (key) == 'object') ? key : pair(key, value));
      this.$changes.push(query(this, qq));
      process.nextTick(doUpdate.bind(this));
    };
  }

  function undefer() {
    this.$deferred = false;
    process.nextTick(doUpdate.bind(this));
  }

  function doUpdate() {
    if (this.$changes.length && !this.$deferred) this.$update();
  }
  function defer() { this.$deferred = arguments.length ? arguments[0] : true; }
  function update() {
    var changes = this.$changes;
    this.$changes = [];
    if (!changes.length) return;
    if (typeof(updateMethod) == 'string') return this[updateMethod](getUpdateQueryFromChanges(changes));
    return method(this, getUpdateQueryFromChanges(changes));
  }
}

function getUpdateQueryFromChanges(changes) {
}

function pair(key, value) {
  var ret = {};
  ret[key] = value;
  return ret;
}
