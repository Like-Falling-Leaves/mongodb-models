var models = require('../models.js');
var assert = require('assert');

describe('Using fast links', function () {
  // test with simulated class for topics, comments, users, likes.
  var modeler = models({mongoUrl: process.env.MONGO_URL || 'mongodb://127.0.0.1/modelsTest'});
  var Topic, Comment, User;
  var topic, likers = [];

  it ('##Basic setup of classes', function () {
    Topic = modeler.createClass('Topic', 'topics');
    Comment = modeler.createClass('Comment', 'comments');
    User = modeler.createClass('User', '__users');
    assert.ok(Topic.find.byId);
    assert.ok(Comment.find.byId);
    assert.ok(User.find.byId);
  });


  it ('##Installing fast links on the class', function (done) {

    // the collection topicLikes has a document with topicId and
    //   likerId as fields. This allows finding all likes
    //   associated with a topic.
    var query = {query: {topicId: Topic, likerId: User}};
    // But for efficiency reasons, we want to store the first 10
    //   likes directly on the topic itself since most topics wont
    //   have many likes and this will save a separate lookup.
    query.cacheSize =  10;

    // Now install the fast link
    Topic.addFastLink('likes', '_id', query, 'topicLikes');

    // Now create a dummy topic
    Topic.create.one({name: 'Some topic'}, function (err, _topic) {
      assert.equal(err, null);
      assert.ok(_topic);
      assert.equal(_topic.name, 'Some topic');

      // Since we installed the link <like> we should assert some
      // simple methods added to the topic object for creating,
      // removing and fetching all likes on a topic
      assert.ok(_topic.likes);
      assert.ok(_topic.likeIds);

      assert.ok(_topic.addLike);
      assert.ok(_topic.addLikeId);
      assert.ok(_topic.addLikes);
      assert.ok(_topic.addLikeIds);

      assert.ok(_topic.removeLike);
      assert.ok(_topic.removeLikeId);
      assert.ok(_topic.removeLikes);
      assert.ok(_topic.removeLikeIds);

      // you can also check the number of likes any time via the
      // likesCount property and this is synchronous.
      assert.equal(_topic.likesCount, 0);
      topic = _topic;
      done();
    });
  });

  it ('##Adding/Removing some links to an object', function (done) {
    createLikers(1, function (err) {
      assert.ok(!err);

      // it is simple to add a liker;
      topic.addLike(likers[0], function (err) {
        assert.ok(!err);
        
        // it is also easy to fetch all likers:
        topic.likes(function (err, fetchedLikers) {
          assert.ok(!err);
          assert.ok(fetchedLikers);
          assert.equal(1, fetchedLikers.length);
          assert.equal(1, topic.likesCount);
          removeLikes();
        });
      });

      function removeLikes() {
        // it is easy to remove likes too:
        topic.removeLike(likers[0], function (err) {
          assert.ok(!err);

          // we can find if a specific like exists like so:
          topic.findLike(likers[0], function (err, found) {
            assert.equal(err, null);
            assert.ok(!found);
            assert.equal(0, topic.likesCount);
            
            done();
          });
        });
      }
    });
  });

  it ('##Adding/removing multiple links at a time', function (done) {
    createLikers(10, function (err) {
      assert.equal(11, likers.length);

      // lets add 10 likers in one shot first and trigger the
      //   cache size limit.  We will add one more after that which
      //   would end up getting stored in the separate link table.
      topic.addLikes(likers.slice(0, 10), function (err) {
        assert.ok(!err);
        assert.equal(10, topic.likesCount);

        // lets add one more and trigger the cache size limit problem
        topic.addLike(likers[10], function (err) {
          assert.ok(!err);
          assert.equal(11, topic.likesCount);

          // Now lets fetch all likes and make sure there are 11
          topic.likes(function (err, fetchedLikes) {
            assert.ok(!err);
            assert.ok(fetchedLikes);
            assert.equal(11, fetchedLikes.length);

            // Now lets remove them all in one shot.
            topic.removeLikes(fetchedLikes, function (err) {
              assert.ok(!err);
              assert.equal(0, topic.likesCount);

              // Now lets refetch all likes and make sure its gone
              topic.likes(function (err, fetched) {
                assert.ok(!err);
                assert.equal(fetched.length, 0);
                done();
              });
            });
          });
        });
      });

    });
  });

  function createLikers(count, done) {
    if (!count) return done();
    User.create.one({name: 'User: ' + count}, function (err, uu) {
      assert.equal(err, null);
      likers.push(uu);
      createLikers(count - 1, done);
    });
  }
});
