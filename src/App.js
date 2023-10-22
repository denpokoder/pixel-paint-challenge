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
  var numDiff = 0;
  var changes = new Array();
  for(scany = 0; scany < height; scany++)  
  {
    for(scanx = 0; scanx < width; scanx++)  
    {
      if( before[scanIndex] != after[scanIndex] || 
          before[scanIndex + 1] != after[scanIndex + 1] || 
          before[scanIndex + 2] != after[scanIndex + 2] || 
          before[scanIndex + 3] != after[scanIndex + 3] )
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

var localUsername = "";
var bitmapDataMemory = new Uint8Array(canvasSize.width * canvasSize.height * 4);

function App() {
  /**
   * @type {React.RefObject<HTMLCanvasElement>}
   * */
  const canvasRef = useRef(null);

  const userIdRef = useRef(getUniqueId());
  const websocketRef = useRef(getWebSocket(userIdRef.current));
  const drawColorRef = useRef(randomColor());

  const [color, setColor] = useState(drawColorRef.current);
  const [userName, setUserName] = useState(null);
  const [users, setUsers] = useState([]);
  var mousedown = false;
  var mouseinside = false;

  useEffect(() => {
    console.log("useEffect");
    const canvas = canvasRef.current;
    if (!canvas) return; // should never happen

    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled= false;

    const ws = websocketRef.current;

    canvas.onmousedown = function(e) {
      mousedown = true;
      mouseinside = true;
      ctx.strokeStyle = drawColorRef.current;
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(e.offsetX, e.offsetY);
    };

    canvas.onmousemove = function(e) {
      if (mousedown && mouseinside) {
        var width = canvasSize.width;
        var height = canvasSize.height;

        ctx.lineTo(e.offsetX, e.offsetY);
        ctx.stroke();

        var bitmapData = ctx.getImageData(0, 0, width, height);
        var changes = CompareBitmap(bitmapDataMemory, bitmapData.data, width, height);
        bitmapDataMemory.set(bitmapData.data);
        ws.send(JSON.stringify({messageType: 'updateBitmap',data: changes}));
      }
    };
  
    canvas.onmouseenter = function(e) {
      if (mousedown) {
        mouseinside = true;
        ctx.beginPath();
        ctx.moveTo(e.offsetX+0.5, e.offsetY+0.5);
      }
    };  

    canvas.onmouseleave = function(e) {
      if (mousedown) {
        mouseinside = false;
        ctx.lineTo(e.offsetX+0.5, e.offsetY+0.5);
        ctx.stroke();
      }
    };

    canvas.onmouseup = function(e) {
      mousedown = false;
      mouseinside = false;
      ctx.lineTo(e.offsetX+0.5, e.offsetY+0.5);
      ctx.stroke();
  };

    window.onmouseup = function(e) {
      mousedown = false;
      mouseinside = false;
    };


    ws.onopen = () => {
      // as soon as the websocket connection is established we generate the random username
      try{
        fetch('https://randomuser.me/api/?nat=US').then((response) => response.json()).then((data) => {
          setUserName(data.results[0].name.first + " " + data.results[0].name.last);}
        );
      } catch (error) {
        //if fancy name serer is unreachable we use the user id to form one
        setUserName(`RandomUserName${userIdRef}`);
      }
    };

    ws.onmessage = (e) => {
      const message = JSON.parse(e.data);
      console.log(message);
      switch (message.messageType) {
        case 'updateBitmap':
          var width = canvasSize.width;
          var height = canvasSize.height;
          var bitmapData = ctx.getImageData(0, 0, width, height);
          ApplyDifference(bitmapData.data, message.data);
          ctx.putImageData(bitmapData, 0, 0);
          break;

        case 'initBitmap':
          var width = canvasSize.width;
          var height = canvasSize.height;
          var bitmapData = ctx.getImageData(0, 0, width, height);
          initBitmap(bitmapData.data, message.data, width, height)
          ctx.putImageData(bitmapData, 0, 0);
          break;

        case 'error':
          console.error(message);
          break;
        case 'updateUserList':
          setUsers(message.data);
           break;
        default:
          console.error('Unrecognized message format from server');
      }
    };
  }, []);

  useEffect(() => { 
    drawColorRef.current = color;
    localUsername = userName;
    const ws = websocketRef.current;

    try{
      ws.send(JSON.stringify({ messageType: 'updateUser', data: {color,userName}}));
    } catch (error) {
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