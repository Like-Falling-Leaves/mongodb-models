module.exports = fixupTime;

function fixupTime(info) {
  var now = new Date().getTime();
  if (!info.createdTime) info.createdTime = now;
  if (!info.updatedTime) info.updatedTime = now;
  return info;
}
