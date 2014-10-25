var mongodb = require('mongodb');
var counter = require('mongodb-counter');
var wrap = require('syncwrap');
var _ = require('lazy.js');
var link  = require('./link');
var fastLink = require('./fastLink');
var fixupTime = require('./fixupTime');

module.exports = modeler;
function modeler(options) {
  var counters = counter.createCounters(
    _({}).assign(options).assign({collectionName: options.countersCollectionName}).value()
  );
  var db = wrap(mongodb.MongoClient.connect, mongodb.MongoClient, [options.mongoUrl]);
  var classes = {};
  return {
    createClass: createClass,
    getClass: getClass,
    createObject: createObject,
    findObject: findObject,
  };

  function createClass(name, collectionName, countersName) {
    classes[name] = init;

    // public methods
    init.fromData = fromData(init);
    init.create = createObject(init);
    Object.defineProperty(init, 'find', {get: inherit('find', findObject(init))});
    init.addReference = addReference.bind(null, init);
    init.addLink = addLink.bind(null, init);
    init.addFastLink = addFastLink.bind(null, init);

    // semi-private data
    init.collection = db.get('collection').execSync(collectionName || name);
    init.counters = counters(countersName || name);

    return init;
    function init(obj) {
      if (!this) return new init(obj);
      obj = obj || {};
      for (var key in obj) if (obj.hasOwnProperty(key)) this[key] = obj[key];
      return this;
    }
  }


  function fromData(type) {
    return function (info) { 
      if (info instanceof Array) return _(info).map(type.fromData).value();
      else return new type(info); 
    };
  }

  function createObject(type) {
    if (typeof(type) == 'string') type = classes[type];
    return {one: createOne, many: createMany, ifNotExists: findOrCreateOne};

    function createOne(info, done) {
      fixupTime(info);
      var prefix = info._id && info._id.prefix || '';
      if (prefix) info._id = null;
      var infoWithId = info._id  ? info : setId.wrap(info, prefix, type.counters.getNextUniqueId.wrap()).sync(true);
      var created = type.collection.method('insert', infoWithId).get('0');
      return type.fromData.wrapped(created).sync(true).done(done)();
    }

    function createMany(infoArray, done) {
      var infosWithId = _(infoArray).map(function (obj) {
        fixupTime(obj);
        var prefix = obj._id && obj._id.prefix || '';
        if (prefix) obj._id = null;
        return obj._id ? obj : setId.wrap(info, prefix, type.counters.getNextUniqueId.wrap()).sync(true);
      }).value();
      var created = type.collection.get('insert').exec(unwrap.wrap(infoArray));
      return type.fromData.wrapped(created).sync(true).done(done)();
    }

    function findOrCreateOne(id, info, done) { return type.find.orCreate(id, info, done); }
  }

  function findObject(type) {
    if (typeof(type) == 'string') type = classes[type];
    return {byId: findById, byIds: findByIds, bySearch: findBySearch, orCreate: findOrCreate};

    function findById(id, done) { 
      return findBySearch.wrapped.call(this, {_id: id, deleted: {$ne: 1}}).get('0').done(done)(); 
    }
    function findByIds(ids, done) { 
      return findBySearch.wrapped.call(this, {_id: {$in: ids}, deleted: {$ne: 1}}).done(done)(); 
    }
    function findBySearch() {
      var query = {}, skip = 0, limit = 0, done = noop;
      var args = Array.prototype.slice.call(arguments), options = {sort: {_id: -1}};
      if (typeof(args[args.length - 1]) == 'function') done = args.pop(); 
      if (typeof(args[0]) == 'object') query = args.shift();
      if (typeof(args[0]) == 'object') options.sort = args.shift();
      if (!isNaN(parseInt(args[0]))) options.skip = parseInt(args.shift());
      if (!isNaN(parseInt(args[0]))) options.limit = parseInt(args.shift());

      var search = type.collection.methodSync('find', query, options)
      return type.fromData.wrapped(search.method('toArray')).sync(true).done(done)();
    }      

    function findOrCreate(id, info, done) { 
      var query = (typeof(id) == 'object') ? id : {_id: id};
      fixupTime(info);
      var prefix = info._id && info._id.prefix || '';
      if (prefix) info._id = null;
      var infoWithId = (info._id || query._id) ? info : setId.wrap(info, prefix, type.counters.getNextUniqueId.wrap()).sync(true);
      return findAndModify.wrapped(infoWithId).done(done);

      function findAndModify(infoWithId, done) {
        return type.fromData.wrapped(
          type.collection.method('findAndModify', query, {_id: 1}, {$setOnInsert: infoWithId}, {new: true, upsert: true})
        ).sync(true).done(done)();
      }
    }
  }

  function addReference(type, property, field, otherType) {
    type.prototype[property[0].toLowerCase() + property.slice(1)] = getProperty;
    return type;
    function getProperty(done) {
      return otherType.find.byId(this[field]).done(done);
    }
  }

  function addLink(type, property, field, searchOptions, linkCollectionName) {
    return link(db).addLink(type, property, field, searchOptions, linkCollectionName);
  }

  function addFastLink(type, property, field, searchOptions, linkCollectionName) {
    return fastLink(db).addLink(type, property, field, searchOptions, linkCollectionName);
  }

  function getClass(className) { return classes[className]; }
}
  
function setId(info, prefix, id) { info._id = prefix + id.toString(36); return info; }
function noop() {}
function logIt() { console.log('Finished', arguments); }
function inherit(name, obj) { 
  return function () {
    if (this['_' + name]) return this['_' + name];
    var ret = this['_' + name] = {};
    for (var key in obj) ret[key] = obj[key].bind(this);
    return ret;
  }
};
