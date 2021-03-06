// Copyright 2016 Luca-SAS, licensed under the Apache License 2.0

'use strict';

var fs = require('fs');
var stream = require('stream');
var os = require('os');
var util = require('util');
var thenify = require('thenify').withCallback;
var seedrandom = require('seedrandom');
//var trace = require('line-trace');
var Lines = require('../../lib/lines.js');


if (process.env.SKALE_RANDOM_SEED)
  seedrandom(process.env.SKALE_RANDOM_SEED, {global: true});

module.exports = LocalArray;
module.exports.TextStream = TextStream;

function LocalArray() {
  if (!(this instanceof LocalArray))
    return new LocalArray();
}

// Sources
LocalArray.prototype.lineStream = function (inputStream, opt) {
  this.stream = inputStream.pipe(new Lines()).pipe(new BlockStream(opt.N));
  return this;
};

LocalArray.prototype.parallelize = function (v) {
  this.stream = new ObjectStream();
  this.stream.end(v);
  return this;
};

LocalArray.prototype.textFile = function (path) {
  var raw = fs.readFileSync(path, {encoding: 'utf8'}), data = [];
  raw.split('\n').map(function (s) {if (!s) return; data.push(s);});
  this.stream = new ObjectStream();
  this.stream.end(data);
  return this;
};

// Actions
LocalArray.prototype.collect = thenify(function (done) {
  var res = [];
  this.stream = this.stream.pipe(new TransformStream(function (v) {
    for (var i = 0; i < v.length; i++) this.push([v[i]]);
  }));
  this.stream.on('data', function (data) {res = res.concat(data);});
  this.stream.on('end', function () {done(null, res);});
});

LocalArray.prototype.count = thenify(function (done) {
  var res = 0;
  this.stream = this.stream.pipe(new TransformStream(function (v) {return v.length;}));
  this.stream.on('data', function (data) {res += data;});
  this.stream.on('end', function () {done(null, res);});
});

LocalArray.prototype.countByValue = thenify(function (done) {
  var res = [];
  this.stream = this.stream.pipe(new TransformStream(countByValue));
  this.stream.on('data', function (data) {res = res.concat([data]);});
  this.stream.on('end', function () {done(null, res);});
});

LocalArray.prototype.lookup = function(key) {
  this.stream = this.stream.pipe(new TransformStream(lookup, [key]));
  return this.stream;
};

LocalArray.prototype.reduce = thenify(function (reducer, init, done) {
  var res;
  this.stream = this.stream.pipe(new TransformStream(reduce, [reducer, init]));
  this.stream.on('data', function (data) {
    if (res === undefined) res = data;
    else res = reducer(res, data);
  });
  this.stream.on('end', function () {done(null, res);});
});

LocalArray.prototype.take = function(num, opt, done) {
  opt = opt || {};
  if (arguments.length < 3) done = opt;
  this.stream = this.stream.pipe(new TransformStream(take, [num]));
  if (opt.stream) return this.stream;
  var res = [];
  this.stream.on('data', function (data) {res = res.concat(data);});
  this.stream.on('end', function () {done(null, res);});
};

LocalArray.prototype.takeOrdered = function(num, ordering, opt, done) {
  opt = opt || {};
  if (arguments.length < 4) done = opt;
  this.stream = this.stream.pipe(new TransformStream(takeOrdered, [num, ordering]));
  if (opt.stream) return this.stream;
  var res = [];
  this.stream.on('data', function (data) {res = res.concat(data);});
  this.stream.on('end', function () {done(null, res);});
};

LocalArray.prototype.takeSample = function(withReplacement, num, seed, opt, done) {
  opt = opt || {};
  if (arguments.length < 5) done = opt;
  this.stream = this.stream.pipe(new TransformStream(sample, [withReplacement, 0, num, seed]));
  if (opt.stream) return this.stream;
  var res = [];
  this.stream.on('data', function (data) {res = res.concat(data);});
  this.stream.on('end', function () {done(null, res);});
};

LocalArray.prototype.top = function(num, opt, done) {
  opt = opt || {};
  if (arguments.length < 3) done = opt;
  this.stream = this.stream.pipe(new TransformStream(top, [num]));
  if (opt.stream) return this.stream;
  var res = [];
  this.stream.on('data', function (data) {res = res.concat(data);});
  this.stream.on('end', function () {done(null, res);});
};

// Transformations
LocalArray.prototype.coGroup = function (other) {
  this.stream = this.stream.pipe(new DualTransformStream(other, coGroup));
  return this;
};

LocalArray.prototype.cartesian = function (other) {
  this.stream = this.stream.pipe(new DualTransformStream(other, cartesian));
  return this;
};

LocalArray.prototype.distinct = function () {
  this.stream = this.stream.pipe(new TransformStream(distinct));
  return this;
};

LocalArray.prototype.filter = function (filterer) {
  this.stream = this.stream.pipe(new TransformStream(filter, [filterer]));
  return this;
};

LocalArray.prototype.flatMap = function (mapper) {
  this.stream = this.stream.pipe(new TransformStream(flatMap, [mapper]));
  return this;
};

LocalArray.prototype.flatMapValues = function (mapper) {
  this.stream = this.stream.pipe(new TransformStream(flatMapValues, [mapper]));
  return this;
};

LocalArray.prototype.groupByKey = function () {
  this.stream = this.stream.pipe(new TransformStream(groupByKey));
  return this;
};

LocalArray.prototype.intersection = function (other) {
  this.stream = this.stream.pipe(new DualTransformStream(other, intersection));
  return this;
};

LocalArray.prototype.join = function (other) {
  this.stream = this.stream.pipe(new DualTransformStream(other, join));
  return this;
};

LocalArray.prototype.keys = function () {
  this.stream = this.stream.pipe(new TransformStream(keys));
  return this;
};

LocalArray.prototype.leftOuterJoin = function (other) {
  this.stream = this.stream.pipe(new DualTransformStream(other, leftOuterJoin));
  return this;
};

LocalArray.prototype.map = function (mapper) {
  this.stream = this.stream.pipe(new TransformStream(map, [mapper]));
  return this;
};

LocalArray.prototype.mapValues = function (mapper) {
  this.stream = this.stream.pipe(new TransformStream(mapValues, [mapper]));
  return this;
};

LocalArray.prototype.persist = function () {
  return this;
};

LocalArray.prototype.reduceByKey = function (reducer, init) {
  this.stream = this.stream.pipe(new TransformStream(reduceByKey, [reducer, init]));
  return this;
};

LocalArray.prototype.rightOuterJoin = function (other) {
  this.stream = this.stream.pipe(new DualTransformStream(other, rightOuterJoin));
  return this;
};

LocalArray.prototype.sample = function (withReplacement, frac, seed) {
  this.stream = this.stream.pipe(new TransformStream(sample, [withReplacement, frac, 0, seed]));
  return this;
};

LocalArray.prototype.subtract = function (other) {
  this.stream = this.stream.pipe(new DualTransformStream(other, subtract));
  return this;
};

LocalArray.prototype.union = function (other) {
  this.stream = this.stream.pipe(new DualTransformStream(other, union));
  return this;
};

LocalArray.prototype.values = function () {
  this.stream = this.stream.pipe(new TransformStream(values));
  return this;
};

// Streams
function BlockStream(len) {
  stream.Transform.call(this, {objectMode: true});
  this.len = len;
  this.cnt = 0;
  this.buf = [];
}
util.inherits(BlockStream, stream.Transform);

BlockStream.prototype._transform = function (msg, encoding, done) {
  for (var i = 0; i < msg.length; i++) {
    this.buf.push(msg[i]);
    if (++this.cnt == this.len) {
      this.push(this.buf);
      this.buf = [];
      this.cnt = 0;
    }
  }
  done();
};

// dual transform
function DualTransformStream(other, action) {
  stream.Transform.call(this, {objectMode: true});
  this.other = other;
  this.action = action;
  var self = this;
  if (this.other.stream) {
    this.other.stream.pause();
    this.other.stream.on('end', function () {
      self.otherEnd = true;
    });
  }
}
util.inherits(DualTransformStream, stream.Transform);

DualTransformStream.prototype._transform = function (msg, encoding, done) {
  var otherStream = this.other.stream, action = this.action;
  if (otherStream) {
    var data = otherStream.read();
    if (data !== null) {
      done(null, action(msg, data));
    } else if (this.otherEnd) {
      done(null, msg);
    } else {
      otherStream.once('readable', function () {
        done(null, action(msg, otherStream.read()));
      });
    }
  } else {
    done(null, action(msg, this.other.data));
  }
};

DualTransformStream.prototype._flush = function (done) {
  var self = this;
  if (!this.otherEnd) {
    this.other.stream.resume();
    this.other.stream.on('data', function (d) {self.push(self.action(d, null));});
    this.other.stream.on('end', done);
  } else done();
};

// Text
function TextStream() {
  if (!(this instanceof TextStream))
    return new TextStream();
  stream.Transform.call(this, {objectMode: true});
}
util.inherits(TextStream, stream.Transform);

TextStream.prototype._transform = function (msg, encoding, done) {
  done(null, msg.toString());
};

// Object
function ObjectStream() {
  stream.Transform.call(this, {objectMode: true});
}
util.inherits(ObjectStream, stream.Transform);

ObjectStream.prototype._transform = function (msg, encoding, done) {
  done(null, JSON.parse(JSON.stringify(msg)));
};

// Transform stream
function TransformStream(action, args) {
  this.action = action;
  this.args = args;
  stream.Transform.call(this, {objectMode: true});
}
util.inherits(TransformStream, stream.Transform);

TransformStream.prototype._transform = function (msg, encoding, done) {
  done(null, this.action.apply(this, [].concat([msg], this.args)));
};

// Helper functions
function coGroup(v1, v2) {
  var i, j, v = [], I, J, idx;
  for (i = 0; i < v1.length; i++) {
    I = v1[i][0];
    J = v1[i][1];
    idx = -1;
    for (j = 0; j < v.length; j++) {
      if (v[j][0] == I) {
        idx = j;
        break;
      }
    }
    if (idx != -1) v[idx][1][0].push(J);
    else v[v.length] = [I, [[J], []]];
  }
  for (i = 0; i < v2.length; i++) {
    I = v2[i][0];
    J = v2[i][1];
    idx = -1;
    for (j = 0; j < v.length; j++) {
      if (v[j][0] == I) {
        idx = j;
        break;
      }
    }
    if (idx != -1) v[idx][1][1].push(J);
    else v[v.length] = [I, [[], [J]]];
  }
  return v;
}

function countByValue(v) {
  var tmp = {}, str, i;
  for (i = 0; i < v.length; i++) {
    str = JSON.stringify(v[i]);
    if (tmp[str] === undefined) tmp[str] = [v[i], 0];
    tmp[str][1]++;
  }
  for (i in tmp) this.push(tmp[i]);
}

function cartesian(v1, v2) {
  var v = [], i, j;
  for (i = 0; i < v1.length; i++)
    for (j = 0; j < v2.length; j++)
      v.push([v1[i], v2[j]]);
  return v;
}

function distinct(v) {
  var out = [], ref = {}, s;
  for (var i = 0; i < v.length; i++) {
    s = JSON.stringify(v[i]);
    if (s in ref) continue;
    ref[s] = true;
    out.push(v[i]);
  }
  return out;
}

function filter(v, filterer) {
  return v.filter(filterer);
}

function flatMap(v, mapper) {
  return v.map(mapper).reduce(function (a, b) {return a.concat(b);}, []);
}

function flatMapValues(v, mapper) {
  var i, out = [], t0;
  for (i = 0; i < v.length; i++) {
    t0 = mapper(v[i][1]);
    out = out.concat(t0.map(function (e) {return [v[i][0], e];}));
  }
  return out;
}

function groupByKey(v) {
  var i, idx, keys = [], out = [];
  for (i = 0; i < v.length; i++)
    if (keys.indexOf(v[i][0]) == -1)
      keys.push(v[i][0]);
  for (i = 0; i < keys.length; i++)
    out.push([keys[i], []]);
  for (i = 0; i < v.length; i++) {
    idx = keys.indexOf(v[i][0]);
    out[idx][1].push(v[i][1]);
  }
  return out;
}

function intersection(v1, v2) {
  var e, i, j, v = [];
  for (i = 0; i < v1.length; i++) {
    e = JSON.stringify(v1[i]);
    if (v.indexOf(e) != -1) continue;
    for (j = 0; j < v2.length; j++) {
      if (JSON.stringify(v2[j]) == e) {
        v.push(v1[i]);
        break;
      }
    }
  }
  return v;
}

function leftOuterJoin(v1, v2) {
  var i, j, found, v = [];
  for (i = 0; i < v1.length; i++) {
    found = false;
    for (j = 0; j < v2.length; j++) {
      if (v1[i][0] == v2[j][0]) {
        found = true;
        v.push([v1[i][0], [v1[i][1], v2[j][1]]]);
      }
    }
    if (!found)
      v.push([v1[i][0], [v1[i][1], null]]);
  }
  return v;
}

function join(v1, v2) {
  var i, j, v = [];
  for (i = 0; i < v1.length; i++)
    for (j = 0; j < v2.length; j++)
      if (v1[i][0] == v2[j][0])
        v.push([v1[i][0], [v1[i][1], v2[j][1]]]);
  return v;
}

function keys(v) {
  return v.map(function (e) {return e[0];});
}

function lookup(v, key) {
  return v.filter(function (e) {return e[0] == key;});
}

function map(v, mapper) {
  return v.map(mapper);
}

function mapValues(v, mapper) {
  return v.map(function (e) {return [e[0], mapper(e[1])];});
}

function reduce(v, reducer, init) {
  return v.reduce(reducer, JSON.parse(JSON.stringify(init)));
}

function reduceByKey(v, reducer, init) {
  var i, idx, keys = [], res = [];
  for (i = 0; i < v.length; i++)
    if (keys.indexOf(v[i][0]) == -1)
      keys.push(v[i][0]);
  for (i = 0; i < keys.length; i++)
    res.push([keys[i], init]);
  for (i = 0; i < v.length; i++) {
    idx = keys.indexOf(v[i][0]);
    res[idx][1] = reducer(res[idx][1], v[i][1]);
  }
  return res;
}

function rightOuterJoin(v1, v2) {
  var i, j, found, v = [];
  for (i = 0; i < v2.length; i++) {
    found = false;
    for (j = 0; j < v1.length; j++) {
      if (v2[i][0] == v1[j][0]) {
        found = true;
        v.push([v2[i][0], [v1[j][1], v2[i][1]]]);
      }
    }
    if (!found)
      v.push([v2[i][0], [null, v2[i][1]]]);
  }
  return v;
}

function sample(v, withReplacement, frac, num, seed) {
  var P = process.env.UGRID_WORKER_PER_HOST || os.cpus().length;
  if (P > v.length) P = v.length;
  if (num) P = 1;
  if (seed === undefined) seed = 1;

  function split(a, n) {
    var len = a.length, out = [], i = 0;
    while (i < len) {
      var size = Math.ceil((len - i) / n--);
      out.push(a.slice(i, i += size));
    }
    return out;
  }
  var map = split(v, P);

  var workerMap = [];
  for (var i = 0; i < P; i++) {
    workerMap[i] = {};
    workerMap[i][i] = map[i];
  }

  var out = [];
  for (var w = 0; w < P; w++) {
    var p = 0;
    var tmp = [];
    for (i in workerMap[w]) {
      var L = workerMap[w][i].length;
      L = num ? num : Math.ceil(L * frac);
      tmp[p] = {data: []};
      var idxVect = [];
      while (tmp[p].data.length != L) {
        var idx = Math.round(Math.abs(Math.random()) * (L - 1));
        if ((idxVect.indexOf(idx) != -1) &&  !withReplacement)
          continue; // if already picked but no replacement mode
        idxVect.push[idx];
        tmp[p].data.push(workerMap[w][i][idx]);
      }
      out = out.concat(tmp[p].data);
      p++;
    }
  }
  return out;
}

function subtract(v1, v2) {
  var v = [], i, j, found, s1 = v1.map(JSON.stringify), s2 = v2.map(JSON.stringify);
  for (i = 0; i < s1.length; i++) {
    found = false;
    for (j = 0; j < s2.length; j++)
      if (s2[j] == s1[i]) {
        found = true;
        break;
      }
    if (!found)
      v.push(v1[i]);
  }
  return v;
}

function take(v, num) {
  return v.slice(0, num);
}

function takeOrdered(v, num, ordering) {
  //return v.sort(ordering).slice(0, num);
  var out = [];
  for (var i = 0; i < v.length; i++) {
    out = out.concat([v[i]]).sort(ordering).slice(0, num);
  }
  return out;
}

function top(v, num) {
  return v.sort().slice(0, num);
}

function union(v1, v2) {
  return v1.concat(v2);
}

function values(v) {
  return v.map(function (e) {return e[1];});
}
