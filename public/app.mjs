import {initialState,current,change} from './timer.mjs';
import {DISCORD_CLIENT_ID} from './config.mjs';
const elements=new Map([...document.querySelectorAll('[id]')].map(el=>[el.id,el]));
const $=id=>elements.get(id);
const text=(id,value)=>{if($(id).textContent!==value)$(id).textContent=value;};
const clock=new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',hour:'numeric',minute:'2-digit',timeZoneName:'short'});
// Everyone opens on the same hourly schedule. No messages or shared state are exchanged.
let state=change(initialState(),{type:'sync'},Date.now());
let renderTimeout;
function render() {
  if(document.hidden)return;
  const now=Date.now(),view=current(state,now);
  const seconds=Math.max(0,Math.ceil(view.remaining/1000));
  const display=String(Math.floor(seconds/60)).padStart(2,'0')+':'+String(seconds%60).padStart(2,'0');
  text('countdown',display);text('phase',view.phase==='focus'?'Focus':'Break');
  document.body.classList.toggle('break',view.phase==='break');
  const title=`${display} · ${view.phase==='focus'?'Focus':'Break'}`;
  if(document.title!==title)document.title=title;
  text('toggle',view.running?'Pause':(view.remaining===(view.phase==='focus'?view.focus:view.rest)*60000?'Start':'Resume'));
  text('next',view.running?`${view.phase==='focus'?'Break':'Focus'} at ${clock.format(view.endsAt)}`:'Ready when you are.');
  const pressed=String(view.mode==='hourly');
  if($('sync').getAttribute('aria-pressed')!==pressed)$('sync').setAttribute('aria-pressed',pressed);
  const label=view.mode==='hourly'?'Synchronized to the hour ':'Synchronize to the hour ';
  if($('sync').firstChild.textContent!==label)$('sync').firstChild.textContent=label;
  text('connection',view.mode==='hourly'?'Hourly schedule':'Personal timer');
  text('clock',clock.format(now));
}
function tick(){
  clearTimeout(renderTimeout);render();
  if(!document.hidden)renderTimeout=setTimeout(tick,1000-(Date.now()%1000)+5);
}
function act(type,extra={}) {
  try {
    state=change(state,{type,...extra},Date.now());
    $('focus').value=state.focus;$('rest').value=state.rest;
    text('message',type==='sync'?'Following the Eastern Time schedule.':type==='durations'?'Your timer lengths are updated.':type==='pause'?'Your timer is paused.':type==='reset'?'Your timer is reset.':'Your timer is running.');
    tick();
  }catch(e){text('message',e.message);}
}
$('toggle').onclick=()=>act(current(state,Date.now()).running?'pause':'start');
$('reset').onclick=()=>act('reset');$('sync').onclick=()=>act('sync');
$('durations').onsubmit=e=>{e.preventDefault();act('durations',{focus:Number($('focus').value),rest:Number($('rest').value)});};
document.addEventListener('visibilitychange',()=>{if(document.hidden)clearTimeout(renderTimeout);else tick();});
window.addEventListener('pageshow',tick);
tick();
// Only the Discord handshake uses the SDK. The timer never waits for it and uses no OAuth or API.
if(new URLSearchParams(location.search).has('frame_id')&&DISCORD_CLIENT_ID){
  import('./discord-sdk.js').then(async({DiscordSDK})=>{
    const sdk=new DiscordSDK(DISCORD_CLIENT_ID);await sdk.ready();
    $('people').hidden=false;
    text('members','Loading people in this Activity…');
    let receivedUpdate=false;
    const show=({participants})=>{
      text('members',`${participants.length} ${participants.length===1?'person':'people'} in this Activity`);
      text('names',participants.map(person=>person.global_name||person.username).join(' · '));
    };
    // Use Discord's native presence events, never a polling service or our own backend.
    try {
      await sdk.subscribe('ACTIVITY_INSTANCE_PARTICIPANTS_UPDATE',data=>{receivedUpdate=true;show(data);});
      const initial=await sdk.commands.getInstanceConnectedParticipants();
      if(!receivedUpdate)show(initial);
    }catch{
      if(!receivedUpdate)text('members','Participant list unavailable in this Discord session.');
    }
  }).catch(()=>text('message','Discord connection unavailable; the local timer still works.'));
}
