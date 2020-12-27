var socket = io();

const STATE = {REGISTER : "REGISTER",
             WAITING : "WAITING",
             GUESS : "GUESS",
             RESULT : "RESULT",
             CHOOSE : "CHOOSE",
             DRAW : "DRAW",
             PODIUM: "PODIUM"}

let registerState = { htmlElement : document.getElementById(STATE.REGISTER), name : STATE.REGISTER}
let waitingState = { htmlElement : document.getElementById(STATE.WAITING), name : STATE.WAITING};
let guessState = { htmlElement : document.getElementById(STATE.GUESS), name : STATE.GUESS};
let resultState = { htmlElement : document.getElementById(STATE.RESULT), name : STATE.RESULT};
let chooseState = { htmlElement : document.getElementById(STATE.CHOOSE), name : STATE.CHOOSE};
let drawState = { htmlElement : document.getElementById(STATE.DRAW), name : STATE.DRAW};
let podiumState = { htmlElement : document.getElementById(STATE.PODIUM), name : STATE.PODIUM};
let states = [registerState, waitingState, guessState, resultState, chooseState, drawState, podiumState];
let currentState = null;

var user = {
    name : null,
    token : null,
    socketId : null
}

var timerHtmlElement = document.getElementById('timer__view');
var roundViewHtmlElement = document.getElementById('round__view');

/**
 * When socket is load try to connect with session in local storage
 * otherwise display register state
 */
socket.on("connect", () => {
  console.warn("Connection socket")
  user.socketId = socket.id
  userStored = localStorage.getItem('user')
  if(userStored != null){
      user = JSON.parse(userStored);
      socket.emit('reconnect', user, (response) => {
        if(response.status === 'ok'){
          game(response.game);
        }else{
          localStorage.removeItem('user');
          moveToState(STATE.REGISTER);
        }
      });
  }else{
    moveToState(STATE.REGISTER);
  }
});

function register(){
    let nameInput = document.getElementById('name');
    let name = nameInput.value;
    if(name != undefined && name != '' && name != null){
      user.name = name;
      user.token = `${name}-${new Date().getTime()}`;
      localStorage.setItem('user',JSON.stringify(user))
      socket.emit('register', user, (response)=>{
        if(response.status == 'ok'){
          game(response.game);
        }
      });
    }
}

function chatSend(){
  let input = document.getElementById('GUESS__input');
  let value = input.value;
  if(value != null && value != undefined && value != ''){
    socket.emit('guess', value);
    input.value = '';
  }
}

socket.on('game', (game)=>{
  this.game(game);
})

socket.on('chat', (message)=>{
  let guessChatHtmlElement = document.getElementById("GUESS__chat");
  let p = document.createElement('p');
  p.innerHTML = message;
  guessChatHtmlElement.appendChild(p);
  guessChatHtmlElement.scrollTop = guessChatHtmlElement.scrollHeight;
})

socket.on('timer', (time)=>{
  timerHtmlElement.innerHTML = time;
})

socket.on('mask', (game)=>{
  updateWordMasked(game);
})

/**
 * Send start event to socket io server to start game when waiting state
 */
function startGame(){
  socket.emit('start');
}

function game(game){
  if(IamLogged(game.users)){
    moveToState(game.state);
    roundView(game);

    if(game.state === STATE.WAITING){
      roundHidden(true);
      timerHidden(true);
      updateUsersList(game.users);
    }
    else if(game.state === STATE.CHOOSE){
      roundHidden(false);
      timerHidden(true);
      onChooseState(game);
    }
    else if(game.state === STATE.GUESS){
      roundHidden(false);
      timerHidden(false);
      if(game.userDrawing.token === user.token){
        moveToState(STATE.DRAW);
        onDrawState(game)
      }else{
        onGuessState(game);
      }
    }
    else if(game.state === STATE.RESULT){
      roundHidden(false);
      timerHidden(true);
      onResultState(game);
    }
    else if(game.state === STATE.PODIUM){
      roundHidden(true);
      timerHidden(true);
      onPodiumState(game);
    }
  }

}

/**
 * Display state specified in param and hide all the others
 * @param {*} nextState 
 */
function moveToState(nextState){
  if(nextState != currentState){
    states.forEach((state)=>{
      if(state.name === nextState){
        state.htmlElement.style.display='block';
      }else{
        state.htmlElement.style.display='none';
      }
    });
  }
  currentState = nextState;
};

/**
 * Update user list in waiting state
 * @param {*} users 
 */
function updateUsersList(users){
  let waitingUserList = document.getElementById("WAITING__user-list");
  waitingUserList.querySelectorAll('*').forEach(n => n.remove());

  users.forEach((user)=>{
    let li = document.createElement('li');
    li.innerHTML = user.name;
    waitingUserList.appendChild(li);
  })
};

/**
 * Test if client is in server user list
 * @param {*} users 
 */
function IamLogged(users){
  if(users.length > 0){
    if(users.find(user => user.token === this.user.token) == undefined){
      return false;
    }else{
      return true;
    }
  }else{
    return false;
  }
}

function onChooseState(game){
  let userDraw = document.getElementById('CHOOSE__user-draw');
  let wordsDiv = document.getElementById("CHOOSE__words");
  wordsDiv.querySelectorAll('*').forEach(n => n.remove());
  if(game.userDrawing.token === user.token){
    userDraw.innerHTML = `C'est à toi de dessiner !`;
    socket.emit('words', (response)=>{
      response.words.forEach((word)=>{
        let button = document.createElement('button');
        button.setAttribute("word", word)
        button.innerHTML = word
        button.onclick = (event) =>{
          socket.emit('wordChose', event.target.innerHTML);
        }
        wordsDiv.appendChild(button);
      })
    });
  }
  else{
    userDraw.innerHTML = `${game.userDrawing.name} doit choisir un mot`;
  }
}

function onDrawState(game){
  let wordToDrawHtmlElement = document.getElementById('DRAW__word');
  wordToDrawHtmlElement.innerHTML = game.wordToGuess.original;
}

function onGuessState(game){
  updateWordMasked(game);
}

function updateWordMasked(game) {
  let wordToGuessHtmlElement = document.getElementById('GUESS__word');
  wordToGuessHtmlElement.innerHTML = game.wordToGuess.masked;
}

function onResultState(game){
  let listHtmlElement = document.getElementById('RESULT_table');
  listHtmlElement.querySelectorAll('*').forEach(n => n.remove());

  game.result.forEach((r)=>{
    let tr = document.createElement('tr');

    let tdUser  = document.createElement('td');
    tdUser.innerHTML = r.user.name;
    tr.appendChild(tdUser);
    
    let tdPoint  = document.createElement('td');
    tdPoint.innerHTML = `+ ${r.point}`;
    tr.appendChild(tdPoint);
    
    let tdScore  = document.createElement('td');
    tdScore.innerHTML = r.user.score;
    tr.appendChild(tdScore);

    listHtmlElement.appendChild(tr);

  })
}

function onPodiumState(game){
  let tableHtmlElement = document.getElementById('PODIUM__table');
  tableHtmlElement.querySelectorAll('*').forEach(n => n.remove());
  game.users.forEach((user)=>{
    let tr = document.createElement('tr');

    let tdUser  = document.createElement('td');
    tdUser.innerHTML = user.name;
    tr.appendChild(tdUser);
    
    let tdScore  = document.createElement('td');
    tdScore.innerHTML = user.score;
    tr.appendChild(tdScore);

    tableHtmlElement.appendChild(tr);
  });


}

function roundView(game){
  roundViewHtmlElement.innerHTML = `round ${game.round}`
}

function timerHidden(hide){
  if(hide){
    timerHtmlElement.style.display = 'none'
  }else{
    timerHtmlElement.style.display = 'block'
  }
}

function roundHidden(hide){
  if(hide){
    roundViewHtmlElement.style.display = 'none'
  }else{
    roundViewHtmlElement.style.display = 'block'
  }
}