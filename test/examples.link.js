var models = require('../models.js');
var assert = require('assert');

describe('Using links', function () {
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


  it ('##Installing links on the class', function (done) {

    // the collection topicLikes has a document with topicId and
    //   likerId as fields. This allows finding all likes
    //   associated with a topic.
    var query = {query: {topicId: Topic, likerId: User}};

    // Now install the fast link
    Topic.addLink('likes', '_id', query, 'topicLikes');

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
            
            done();
          });
        });
      }
    });
  });

  it ('##Adding/removing multiple links at a time', function (done) {
    createLikers(10, function (err) {
      assert.equal(11, likers.length);

      // lets add 10 likers in one shot first.
      topic.addLikes(likers.slice(0, 10), function (err) {
        assert.ok(!err);

        // lets add one more individually
        topic.addLike(likers[10], function (err) {
          assert.ok(!err);

          // Now lets fetch all likes and make sure there are 11
          topic.likes(function (err, fetchedLikes) {
            assert.ok(!err);
            assert.ok(fetchedLikes);
            assert.equal(11, fetchedLikes.length);

            // Now lets remove them all in one shot.
            topic.removeLikes(fetchedLikes, function (err) {
              assert.ok(!err);

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
