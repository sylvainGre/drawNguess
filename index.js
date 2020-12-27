var app = require('express')();
var http = require('http').createServer(app);
var io = require('socket.io')(http);
var Words = require('./ressources/words.json')

const STATE = {REGISTER : "REGISTER",
               WAITING : "WAITING",
               GUESS : "GUESS",
               RESULT : "RESULT",
               CHOOSE : "CHOOSE",
               DRAW : "DRAW",
               PODIUM: "PODIUM"}

const TIMER = 10;
const ROUND = 1;

var game = {
  state : STATE.WAITING,
  users : [],
  round : 1,
  userDrawing : null,
  wordToGuess : {
    original : '',
    masked : ''
  },
  userHaveGuess : [],
  timer : TIMER,
  result : []
}

var wordKeepToFound = Words;


app.get('/', (req, res) => {
  res.sendFile(__dirname + '/client/index.html');
});

app.get('/client.js', (req, res) => {
  res.sendFile(__dirname + '/client/client.js');
});

app.get('/client.css', (req, res) => {
  res.sendFile(__dirname + '/client/client.css');
});


io.on('connection', (socket) => {
    socket.on('reconnect', (user, callback) => {
        index = game.users.findIndex((u)=> u.token === user.token);
        if(index > -1){
          game.users[index].socketId = socket.id
          user = game.users[index];

          console.log('reconnect: ' + user.name + ' / ' + user.token + ' / '+ user.socketId);
          callback({
            status: "ok",
            game : getGame()
          });
        }else{
          callback({
            status: "nok"
          });
        }
    });

    socket.on('disconnect', () => {
      user = findUserBySocketId(socket.id)
      if(user != undefined){
        console.log(`${user.name} disconnected`);
      }
    });

    socket.on('register', (user, callback) => {
       
        let newUser = new User(user.name, user.token, socket.id);
        
        console.log('register: ' + newUser.name + ' / ' + newUser.token + ' / ' + newUser.socketId );
        game.users.push(newUser);
        console.log(`${newUser.name} join`);
        socket.broadcast.emit('game', game);
        callback({
          status: "ok",
          game : getGame()
        });
    });

    socket.on('start', ()=>{
      game.state = STATE.CHOOSE;
      game.userDrawing = game.users[0];
      io.emit('game', game);
    });

    socket.on('words', (callback)=>{
      
      callback({words : randomWords(3)});
      
    })

    socket.on('wordChose', (word)=>{
      game.wordToGuess.original = word;
      game.wordToGuess.masked = maskWord(word);
      game.state = STATE.GUESS;
      
      let index = wordKeepToFound.family.findIndex((w)=> w === word)
      if(index>-1){
        wordKeepToFound.family.splice(index, 1);
      }

      io.emit('game', game);
      startTimer();
    })

    socket.on('guess', (word) => {
      let user = findUserBySocketId(socket.id);
      if(word.trim().toUpperCase() === game.wordToGuess.original.toUpperCase()){
        if(!userHasAlreadyFound(user)){
          io.emit('chat', `${user.name} a trouvé !`);
          game.userHaveGuess.push(user);

          if((game.users.length - 1) === game.userHaveGuess.length){
            stopGuessState();
          }
        }
      }else{
        io.emit('chat', `${user.name} : ${word}`);
      }
    });
});

var timerInterval = null;
function startTimer(){
  game.timer = TIMER;
  timerInterval = setInterval(()=>{
    io.emit('timer', game.timer);
    game.timer = game.timer-1;

    if(game.timer == (Math.floor(TIMER /2)) || game.timer == (Math.floor(TIMER /3)) ){
      game.wordToGuess.masked = revealCharacter();
      io.emit('mask', game);
    }

    if(game.timer < 0){
      stopGuessState();
    }
  }, 1000);
}

function stopGuessState(){
  if(timerInterval != null)
    clearInterval(timerInterval);
  game.state = STATE.RESULT;
  
  for(let i = 0; i < game.userHaveGuess.length ; i++){
    game.result.push({
      user : game.userHaveGuess[i],
      point : (300/(i+1))
    })
  };

  game.result.push({
    user : game.userDrawing,
    point : ((200/(game.users.length - 1))*game.userHaveGuess.length)
  });

  game.users.forEach((user)=>{
    if(!userHasAlreadyFound(user) && user.token != game.userDrawing.token){
      game.result.push({
        user : user,
        point : 0
      })
    }
  })
  game.users.forEach((user)=>{
    user.score = user.score + game.result.find((r)=>r.user.token === user.token).point;
  })

  io.emit('game', game);

  setTimeout(()=>{
    nextGuess();
  }, 10000)
}

function nextGuess(){
  game.wordToGuess = {original : '',masked : ''};
  game.userHaveGuess = [];
  game.result = [];
  let index = game.users.findIndex((u)=>u.token === game.userDrawing.token);
  let gameEnd = false;
  // Si dernier joueur
  if((index + 1) >= game.users.length){
    // Si fin du partie
    if((game.round + 1) > ROUND){
      gameEnd = true;
      partyEnd();
    }else{
      game.round = game.round + 1
      game.userDrawing = game.users[0];
    }
  }else{
    game.userDrawing = game.users[index + 1];
  }

  if(!gameEnd){
    game.state = STATE.CHOOSE;
    io.emit('game', game)
  }
}

function partyEnd(){
  game.state = STATE.PODIUM;
  game.users = bubbleSort(game.users)
  io.emit('game', game);

  setTimeout(()=>{
    game.state = STATE.WAITING;
    game.round = 1;
    game.users.forEach((u)=>u.score = 0);
    io.emit('game', game);
  }, 30000)
}

/** UTILS */
function findUserBySocketId(id){
  return game.users.find(user => user.socketId === id);
}

function getGame(){
  return game;
}

function maskWord(word){
  const regex = /([a-z]|[A-Z])/g;
  // remplace les lettes par un _
  let wordMasked = word.replace(regex, "_")
  return wordMasked;
}

function userHasAlreadyFound(user){
  let index = game.userHaveGuess.findIndex((u)=>u.token === user.token)
  if(index > -1){
    return true;
  }else{
    return false;
  }
}

function getRandomInt(max) {
  return Math.floor(Math.random() * Math.floor(max));
}

function revealCharacter(){
  let index = getRandomInt(game.wordToGuess.original.length);
  let carOrigin = game.wordToGuess.original.charAt(index);
  let wordMasked = game.wordToGuess.masked;
  let newMask = wordMasked.substr(0, index) + carOrigin + wordMasked.substr(index + 1 , game.wordToGuess.masked.length - index);
  return newMask;
}

function randomWords(number = 3){
  let array = []
  for(let i = 0; i < number; i++){
    array.push(wordKeepToFound.family[getRandomInt(wordKeepToFound.family.length)])
  }
  return array;
}

function getRandomInt256(max){
  if(max > 256){
    let index = max + 1;
    while(index > max){
      let arrayRandCrypto = new Uint8Array(1);
      window.crypto.getRandomValues(array);
      let randomInt = 0;
      while(randomInt == 0){
        randomInt = getRandomInt(Math.round(max/256));
      }
      index = arrayRandCrypto[0] * randomInt;
    }
    return index;
  }  
}

function bubbleSort(users){ 
  let n = users.length; 
  for (let i = 0; i < n-1; i++) {
      for (let j = 0; j < n-i-1; j++) {
          if (users[j].score < users[j+1].score) 
          {
              // swap arr[j+1] and arr[j]
              let temp = users[j]; 
              users[j] = users[j+1]; 
              users[j+1] = temp; 
          }
      }
  } 
  return users;
}

/** SERVEUR */
http.listen(3000, () => {
  console.log('listening on *:3000');
});

class User {
  name;
  token;
  socketId;
  score = 0;

  constructor(name, token, socketId){
    this.name = name;
    this.token = token;
    this.socketId = socketId;
  }

  addScore(points){
    score = score + points
  }

  setSocketId(socketId){
    this.socketId = socketId
  }
}