import React, { useEffect, useRef, useState } from 'react';
import { canvasSize } from './constants';
import './App.css';

function randomColor() {
  return `#${[0, 0, 0]
    .map(() => Math.floor(Math.random() * 256).toString(16))
    .join('')}`;
}

function CompareBitmap(before, after, width, height)
{
  var scanx;
  var scany;
  var scanIndex = 0; 
  var changes = [];
  for(scany = 0; scany < height; scany++)  
  {
    for(scanx = 0; scanx < width; scanx++)  
    {
      if( before[scanIndex] !== after[scanIndex] || 
          before[scanIndex + 1] !== after[scanIndex + 1] || 
          before[scanIndex + 2] !== after[scanIndex + 2] || 
          before[scanIndex + 3] !== after[scanIndex + 3] )
      {
        changes.push({index:scanIndex,r:after[scanIndex],g:after[scanIndex+1],b:after[scanIndex+2],a:after[scanIndex+3]});
      }
      scanIndex += 4;
    }
      
  }
  return changes;
}

function initBitmap(bitmapData,initData, width, height)
{
  const arraySize = width * height * 4;
  var index = 0;
  while(index < arraySize) bitmapData[index] = initData[index++];
}

function ApplyDifference(bitmapData,changes)
{
  for(const change of changes)
  {
    //since it's drawn with aliasing on we could do proper alpha blending but no sure it would show and it would be much slower
    bitmapData[change.index] = change.r;
    bitmapData[change.index + 1] = change.g;
    bitmapData[change.index + 2] = change.b;
    bitmapData[change.index + 3] = change.a;
  }
}

let websocket;
function getWebSocket(userId) {
  return (websocket =
    websocket || new WebSocket(`ws://${window.location.hostname}:4040?id=${userId}`));
}

function getUniqueId() {
  return Math.random().toString(16).slice(2);
}

var bitmapDataMemory = new Uint8Array(canvasSize.width * canvasSize.height * 4);

function App() {
  /**
   * @type {React.RefObject<HTMLCanvasElement>}
   * */
  const canvasRef = useRef(null);

  const userIdRef = useRef(getUniqueId());
  const websocketRef = useRef(getWebSocket(userIdRef.current));
  const drawColorRef = useRef(randomColor());
  const mousedownRef = useRef(false);
  const mouseinsideRef = useRef(false);
  const userNameRef = useRef("");

  const [color, setColor] = useState(drawColorRef.current);
  const [userName, setUserName] = useState(null);
  const [users, setUsers] = useState([]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return; // should never happen

    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled= false;

    const ws = websocketRef.current;

    canvas.onmousedown = function(e) {
      mousedownRef.current = true;
      mouseinsideRef.current = true;
      ctx.strokeStyle = drawColorRef.current;
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(e.offsetX, e.offsetY);
    };

    canvas.onmousemove = function(e) {
      if (mousedownRef.current && mouseinsideRef.current) {
        var width = canvasSize.width;
        var height = canvasSize.height;

        ctx.lineTo(e.offsetX, e.offsetY);
        ctx.stroke();

        //we analyse what has changed since last update and only send to the server the pixel that got changed
        var bitmapData = ctx.getImageData(0, 0, width, height);
        var changes = CompareBitmap(bitmapDataMemory, bitmapData.data, width, height);
        bitmapDataMemory.set(bitmapData.data);
        ws.send(JSON.stringify({messageType: 'updateBitmap',data: changes}));
      }
    };
  
    canvas.onmouseenter = function(e) {
      if (mousedownRef.current) {
        mouseinsideRef.current = true;
        ctx.beginPath();
        ctx.moveTo(e.offsetX, e.offsetY);
      }
    };  

    canvas.onmouseleave = function(e) {
      if (mousedownRef.current) {
        mouseinsideRef.current = false;
        ctx.lineTo(e.offsetX, e.offsetY);
        ctx.stroke();
      }
    };

    canvas.onmouseup = function(e) {
      mousedownRef.current = false;
      mouseinsideRef.current = false;
      ctx.lineTo(e.offsetX, e.offsetY);
      ctx.stroke();
  };

    window.onmouseup = function(e) {
      mousedownRef.current = false;
      mouseinsideRef.current = false;
    };


    ws.onopen = () => {
      // as soon as the websocket connection is established we generate the random username
      try{
        fetch('https://randomuser.me/api/?nat=US').then((response) => response.json()).then((data) => {
          setUserName(data.results[0].name.first + " " + data.results[0].name.last);}
        );
      } catch (error) {
        //if fancy name servr is unreachable we use the user id to form one
        setUserName(`RandomUserName${userIdRef}`);
      }
    };

    ws.onmessage = (e) => {
      const message = JSON.parse(e.data);
      var width = canvasSize.width;
      var height = canvasSize.height;
      var bitmapData;

      switch (message.messageType) {
        case 'updateBitmap':
          //we retreive and apply differential changes generated by other clients
          bitmapData = ctx.getImageData(0, 0, width, height);
          ApplyDifference(bitmapData.data, message.data);
          ctx.putImageData(bitmapData, 0, 0);
          break;

        case 'initBitmap':
          //we retreive, store and display the current image kept by the server
          bitmapData = ctx.getImageData(0, 0, width, height);
          initBitmap(bitmapData.data, message.data, width, height)
          ctx.putImageData(bitmapData, 0, 0);
          break;

        case 'error':
          console.error(message);
          break;

        case 'updateUserList':
          setUsers(message.data.map((user) => user.userName == userNameRef.current ? ({id: user.id, userName: user.userName + ' (you)', color: user.color }) : user));
           break;

        default:
          console.error('Unrecognized message format from server');
      }
    };
  }, []);

  useEffect(() => { 

    //this is probably utterly stupid but for the love of god I couldn't get the "color" state to change in the code
    //even with this the color value is often missing at refresh
    drawColorRef.current = color;
    userNameRef.current = userName;
    const ws = websocketRef.current;

    //I also couldn't figure out a way to ensure that the websocket is fonctional then I reach this part of code.
    try{
      ws.send(JSON.stringify({ messageType: 'updateUser', data: {color,userName}}));
    } catch (error) {
      //oh well
      console.error(error);
    }
  }, [color,userName]);


  return (
    <div className="app">
      <header>
        <h1>Pixel paint</h1>
        <div className="color_selection">
          Your color:{' '}
          <input
            type="color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
          />
        </div>
      </header>
      <main className="main_content">
        <div className="canvas_container">
          <canvas
            ref={canvasRef}
            width={canvasSize.width}
            height={canvasSize.height}
          />
        </div>
        <div>
          <h3 className="connected_users_title">Connected users</h3>
          <ol>
            {users.map((user) => (<ConnectedUser key={user.id} color={user.color} name={user.userName} />))}
          </ol>
        </div>
      </main>
    </div>
  );
}

function ConnectedUser({ color, name }) {
  return (
    <div className="connected_user">
      <div className="user_color" style={{ '--user-color': color }} />
      <div>{name}</div>
    </div>
  );
}

export default App;