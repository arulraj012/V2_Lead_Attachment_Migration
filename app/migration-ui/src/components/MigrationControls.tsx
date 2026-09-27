import { useState } from "react";
import { Button, Input, FlexBox, MessageStrip, DatePicker, Label, Panel } from "@ui5/webcomponents-react";
import { useMigrationActions } from "../hooks/useMigrationActions";
import type { MigrationTriggerOptions } from "../types/migration";
import "@ui5/webcomponents-icons/dist/play.js";
import "@ui5/webcomponents-icons/dist/refresh.js";
import "@ui5/webcomponents-icons/dist/redo.js";
import "@ui5/webcomponents-icons/dist/lab.js";
import "@ui5/webcomponents-icons/dist/decline.js";

interface Props { isRunning: boolean; pendingFailed: number; onRefresh: () => void; }
type Mode = 'idle' | 'run' | 'test';

export function MigrationControls({ isRunning, pendingFailed, onRefresh }: Props) {
  const { triggerMigration, testMigration, retryAllFailed, isTriggering, isTesting, isRetrying } = useMigrationActions();
  const [mode, setMode] = useState<Mode>('idle');
  const [leadId, setLeadId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [max, setMax] = useState("");
  const [msg, setMsg] = useState<{ t: "Positive"|"Negative"; m: string }|null>(null);

  const opts = (): MigrationTriggerOptions => {
    const o: MigrationTriggerOptions = {};
    if (leadId.trim()) o.parentId = leadId.trim();
    if (from) o.createdFrom = from;
    if (to) o.createdTo = to;
    if (max && parseInt(max)>0) o.maxRecords = parseInt(max);
    return o;
  };

  const run = async () => {
    try { setMsg(null); const o=opts(); o.mode='ATTACHMENT_ONLY'; const r=await triggerMigration(o); setMsg({t:"Positive",m:r.message||"Started"}); setMode('idle'); clear(); onRefresh(); }
    catch(e){ setMsg({t:"Negative",m:e instanceof Error?e.message:"Failed"}); }
  };

  const test = async () => {
    try { setMsg(null); const o=opts(); if(!o.maxRecords)o.maxRecords=5; const r=await testMigration(o); setMsg({t:"Positive",m:r.message||`Test (${o.maxRecords} records)`}); setMode('idle'); clear(); onRefresh(); }
    catch(e){ setMsg({t:"Negative",m:e instanceof Error?e.message:"Failed"}); }
  };

  const retry = async () => {
    try { setMsg(null); await retryAllFailed(); setMsg({t:"Positive",m:"Retry initiated"}); onRefresh(); }
    catch(e){ setMsg({t:"Negative",m:e instanceof Error?e.message:"Failed"}); }
  };

  const clear = () => { setLeadId(""); setFrom(""); setTo(""); setMax(""); };
  const cancel = () => { setMode('idle'); clear(); setMsg(null); };
  
  // Validation: Must have Lead ID OR (From AND To date)
  const isValidFilter = () => leadId.trim() !== '' || (from !== '' && to !== '');
  const has = leadId||from||to||max;
  const dis = isRunning||isTriggering||isTesting;
  const canStart = isValidFilter() && !dis;
  const show = mode!=='idle';

  return (
    <FlexBox direction="Column" style={{gap:"1rem"}}>
      {msg && <MessageStrip design={msg.t} hideCloseButton>{msg.m}</MessageStrip>}
      {!show && (
        <FlexBox style={{gap:"0.75rem",flexWrap:"wrap"}}>
          <Button icon="play" design="Emphasized" disabled={dis} onClick={()=>setMode('run')}>Run Migration</Button>
          <Button icon="lab" design="Default" disabled={dis} onClick={()=>setMode('test')}>Test Migration</Button>
          <Button icon="redo" design="Attention" disabled={isRunning||isRetrying||pendingFailed===0} onClick={retry}>Retry Failed ({pendingFailed})</Button>
          <Button icon="refresh" design="Transparent" onClick={onRefresh}>Refresh</Button>
        </FlexBox>
      )}
      {show && (
        <Panel headerText={mode==='run'?'Run Migration - Filters':'Test Migration - Filters'} collapsed={false}>
          <FlexBox direction="Column" style={{gap:"1rem",padding:"0.5rem 0"}}>
            <FlexBox style={{gap:"1rem",flexWrap:"wrap",alignItems:"flex-end"}}>
              <div><Label showColon>Lead ID</Label><Input value={leadId} placeholder="V1 displayId" style={{width:"180px",marginTop:"0.25rem"}} onInput={e=>setLeadId((e.target as any).value)}/></div>
              <div><Label showColon>From</Label><DatePicker value={from} placeholder="Start" style={{width:"140px",marginTop:"0.25rem"}} onChange={e=>setFrom((e.target as any).value)}/></div>
              <div><Label showColon>To</Label><DatePicker value={to} placeholder="End" style={{width:"140px",marginTop:"0.25rem"}} onChange={e=>setTo((e.target as any).value)}/></div>
              <div><Label showColon>Max</Label><Input value={max} placeholder={mode==='test'?"5":"all"} type="Number" style={{width:"80px",marginTop:"0.25rem"}} onInput={e=>setMax((e.target as any).value)}/></div>
              {has && <Button design="Transparent" onClick={clear}>Clear</Button>}
            </FlexBox>
            <MessageStrip design={isValidFilter()?"Information":"Critical"} hideCloseButton>
              {isValidFilter() 
                ? (mode==='run' ? 'Filters valid. Ready to start.' : `Test will process max ${max||'5'} records.`)
                : 'Required: Enter Lead ID OR date range (From & To). Max is optional.'}
            </MessageStrip>
            <FlexBox style={{gap:"0.75rem"}}>
              <Button icon={mode==="run"?"play":"lab"} design="Emphasized" disabled={!canStart} onClick={mode==="run"?run:test}>{mode==="run"?"Start Migration":`Test (${max||"5"} records)`}</Button>
              <Button icon="decline" design="Transparent" onClick={cancel}>Cancel</Button>
            </FlexBox>
          </FlexBox>
        </Panel>
      )}
    </FlexBox>
  );
}
