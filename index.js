var express = require("express");
var app = express();
var server = require("http").createServer(app);
var io = require("socket.io")(server);

var requirejs = require("requirejs");
requirejs.config({
  baseUrl: "public/js/lib",
  paths: {
    app: "../app",
    mustache: "mustache.min"
  },
  nodeRequire: require
});

requirejs([ "mustache", "app/gofish" ],
          function(Mustache, gofish) {
  var port = process.env.PORT || 3e3;
  var deck = new gofish.CardDeck(require(__dirname + "/public/deck.json"));
  var num_suits = deck.suits.length;
  var pile = new gofish.CardHand(deck, true);
  pile.shuffle();
  var game = {
    pile_size: pile.cards.length,
    turn: null, // it's users[turn]'s turn (unless null)
    users: [],
  };

  io.on("connection", function(socket) {
    socket.joined = false;
    socket.hand = new gofish.CardHand(deck);
    socket.sanitize = function(s) {
      return Mustache.render(
        "{{s}}", {s: s});
    };
    // we don't define these game helpers as methods of game,
    // so that we can emit/serialize it.
    socket.update_game = function() {
      game.pile_size = pile.cards.length
    };
    socket.next_turn = function() {
      if (game.users.length<=1) {
          game.turn = null;
      } else {
        if (game.turn===null) {
          game.turn = 0;
        } else {
          game.turn = (game.turn+1)%game.user.length;
        }
        var message = game.users[game.turn].name+"'s turn";
        socket.emit(
          "status", { message: message, game: game });
        socket.broadcast.emit(
          "status", { message: message, game: game });
      }
    };

    socket.on("join", function(username) {
      if (socket.joined) return;
      username = socket.sanitize(username.trim().toLowerCase());
      if (!username) return;
      if (
        game.users.find(
          function (user) { return user.name===username; }
        ))
      {
        socket.emit(
          "username taken", { username: username });
        return;
      }

      socket.username = username;
      socket.hand = new gofish.CardHand(deck);
      socket.user = {
        name: username,
        hand_size: socket.hand.cards.length,
        ranks: []
      };
      game.users.push(socket.user);
      socket.joined = true;
      socket.emit("joined", {
        username: username,
        game: game
      });
      socket.broadcast.emit("user joined", {
        username: username,
        game: game
      });
      if (pile.cards.length>=num_suits) {
        deck.suits.forEach(function(ignored) {
          var card = pile.give();
          socket.hand.take(card);
          socket.emit("take", {
            rank: card.rank,
            suit: card.suit
          })
        });
        socket.update_game();
        socket.user.hand_size = socket.hand.cards.length;
        socket.emit("status", {
          message: Mustache.render(
            "You draw {{n}} cards",
            {n: num_suits}),
          game: game
        });
        socket.broadcast.emit("status", {
          message: Mustache.render(
            "{{{user}}} draws {{n}} cards",
            {user: socket.username, n: num_suits}),
          game: game
        });
        if (game.users.length>1 && game.turn===null) {
          // game can start
          socket.next_turn();
        };
      } else {
        socket.emit("status", {
          message: "Not enough cards in the pile for you &#128542;",
          game: game          
        });
        socket.broadcast.emit("status", {
          message: Mustache.render(
            "Not enough cards in the pile for {{user}} &#128542;",
            {user: socket.username}),
          game: game          
        });
      }
    });
    socket.on("new message", function(data) {
      data = socket.sanitize(data);
      socket.broadcast.emit("new message", {
        username: socket.username,
        message: data
      });
    });
    socket.on("typing", function() {
      socket.broadcast.emit("typing", {
        username: socket.username
      });
    });
    socket.on("stop typing", function() {
      socket.broadcast.emit("stop typing", {
        username: socket.username
      });
    });
    socket.on("disconnect", function() {
      if (socket.joined) {
        var i = game.users.indexOf(socket.user);
        if (i >= 0) {
          game.users.splice(i, 1);
          if (i===game.turn || game.users.length==1) {
            socket.next_turn();
          }
        }
        socket.hand.cards.forEach(function(card) {
          pile.take(card);
        });
        socket.user.ranks.forEach(function(r) {
          deck.getRank(r).cards.forEach(function(card) {
            pile.take(card);         
          });
        });
        pile.shuffle();
        socket.update_game();
                    
        socket.broadcast.emit("user left", {
          username: socket.username,
          game: game
        });
      }
    });
  });
  
  server.listen(port, function() {
    console.log(Mustache.render(
      "Server listening at port {{port}}", { port: port }
    ));
  });
                
                

  app.use(express.static("public"));

})();

