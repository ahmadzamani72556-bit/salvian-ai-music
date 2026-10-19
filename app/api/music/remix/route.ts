import { NextRequest, NextResponse } from "next/server";
import { createMusicProjectServer } from "../../../../lib/server-music-projects";

export const runtime = "nodejs";
export const maxDuration = 300;

const MUREKA_BASE_URL = (process.env.MUREKA_BASE_URL || "https://api.mureka.ai").replace(/\/$/, "");
const MUREKA_API_KEY = process.env.MUREKA_API_KEY || process.env.MUSIC_API_KEY;
function text(value: unknown) { return typeof value === "string" ? value.trim() : ""; }
function field(value: unknown, key: string): unknown {
  if (!value || typeof value !== "object") return undefined;
  return (value as Record<string, unknown>)[key];
}
function nestedMessage(value: unknown) { return text(field(value, "message")); }
async function readJson(response: Response): Promise<Record<string, unknown>> { const raw = await response.text().catch(() => ""); if (!raw) return {}; try { const parsed: unknown = JSON.parse(raw); return parsed && typeof parsed === "object" ? parsed as Record<string, unknown> : { raw }; } catch { return { raw }; } }
function clearStage2Cookies(response: NextResponse) { const options={httpOnly:true,secure:process.env.NODE_ENV==="production",sameSite:"lax" as const,maxAge:0}; response.cookies.set("salvian_stage2_pending","",{...options,path:"/api/music"}); response.cookies.set("salvian_stage2_remix_id","",{...options,path:"/api/music"}); response.cookies.set("salvian_stage2_remix_id_root","",{...options,path:"/"}); return response; }
async function murekaUploadUrl(url:string,purpose:"reference"|"remix"){const form=new FormData();form.append("url",url);form.append("purpose",purpose);const response=await fetch(`${MUREKA_BASE_URL}/v1/files/upload`,{method:"POST",headers:{Authorization:`Bearer ${MUREKA_API_KEY}`,Accept:"application/json"},body:form,cache:"no-store"});const data=await readJson(response);if(!response.ok){const reason=nestedMessage(field(data,"error"))||text(field(data,"message"));throw new Error(`Mureka upload ${purpose} gagal (${response.status}): ${reason||"respons tidak menjelaskan penyebab"}`);}const id=text(field(data,"id")||field(data,"file_id")||field(data,"fileId")||field(data,"upload_id")||field(data,"uploadId")||field(field(data,"data"),"id")||field(field(data,"data"),"file_id")||field(field(data,"data"),"fileId")||field(field(data,"data"),"upload_id")||field(field(data,"data"),"uploadId")||field(field(data,"file"),"id")||field(field(data,"file"),"file_id")||field(field(data,"file"),"upload_id"));if(!id)throw new Error(`Mureka tidak mengembalikan ID untuk upload ${purpose}.`);return{id,data};}
async function saveTask(workspace:string,title:string,lyrics:string,prompt:string,taskId:string,status:string,providerData:unknown){return createMusicProjectServer(workspace,{title,lyrics,style:prompt,model:"mureka-remix",taskId,status,audioUrl:null,providerData});}

export async function POST(request:NextRequest){
 if(!MUREKA_API_KEY)return NextResponse.json({success:false,error:"MUREKA_API_KEY / MUSIC_API_KEY belum tersedia di server."},{status:503});
 const workspace=request.headers.get("x-music-workspace")?.trim();if(!workspace)return NextResponse.json({success:false,error:"Workspace Music belum siap."},{status:400});
 const body=await request.json().catch(()=>({})) as Record<string,unknown>;const lyrics=text(body.lyrics);const prompt=text(body.prompt||body.style).slice(0,1024);const title=text(body.title)||"Salvian AI Music — Reference Remix";let referenceId=text(body.reference_id||body.referenceId);let referenceUrl=text(body.reference_url||body.referenceUrl);const vocalId=text(body.vocal_id||body.vocalId);let remixUploadId=text(body.remix_upload_id||body.remixUploadId||body.stage2_remix_id);const cookieRemixUploadId=text(request.cookies.get("salvian_stage2_remix_id")?.value);const rootCookieRemixUploadId=text(request.cookies.get("salvian_stage2_remix_id_root")?.value);remixUploadId=remixUploadId||cookieRemixUploadId||rootCookieRemixUploadId;const nRaw=Number(body.n||1);const n=Number.isFinite(nRaw)?Math.min(3,Math.max(1,Math.floor(nRaw))):1;
 if(!lyrics)return clearStage2Cookies(NextResponse.json({success:false,error:"Lirik baru wajib diisi."},{status:400}));if(lyrics.length>5000)return clearStage2Cookies(NextResponse.json({success:false,error:"Lirik maksimal 5000 karakter."},{status:400}));
 try{
   if(referenceUrl && !referenceId){
     if(vocalId){const uploaded=await murekaUploadUrl(referenceUrl,"reference");referenceId=uploaded.id;}
     else if(!remixUploadId){const uploaded=await murekaUploadUrl(referenceUrl,"remix");remixUploadId=uploaded.id;}
   } else if(referenceId.startsWith("http") && !vocalId && !remixUploadId){
     const uploaded=await murekaUploadUrl(referenceId,"remix");remixUploadId=uploaded.id;
   } else if(referenceId.startsWith("http") && vocalId){
     const uploaded=await murekaUploadUrl(referenceId,"reference");referenceId=uploaded.id;
   }
   if(vocalId&&!referenceId)return clearStage2Cookies(NextResponse.json({success:false,error:"Audio Referensi belum memiliki Reference ID Mureka. Upload Audio Referensi baru sekali lagi."},{status:400}));
   const defaultPrompt="Pertahankan karakter Audio Referensi: groove, ritme, harmoni, instrumen, aransemen, dinamika, pacing, nuansa produksi, dan struktur musik. Gunakan lirik baru secara independen dan hasilkan lagu original. Jika menggunakan Remix penuh, pertahankan alur dan durasi sumber sedekat mungkin dengan kemampuan model.";const remixPrompt=(prompt||defaultPrompt).slice(0,1024);
   let providerResponse:Response;let providerData:Record<string,unknown>;let mode:string;
   if(vocalId){mode="mureka-reference-vocal";providerResponse=await fetch(`${MUREKA_BASE_URL}/v1/song/generate`,{method:"POST",headers:{Authorization:`Bearer ${MUREKA_API_KEY}`,"Content-Type":"application/json",Accept:"application/json"},body:JSON.stringify({lyrics,model:text(body.model)||"mureka-9",n,prompt:remixPrompt,reference_id:referenceId,vocal_id:vocalId,stream:body.stream===true}),cache:"no-store"});providerData=await readJson(providerResponse);}
   else {if(!remixUploadId)return clearStage2Cookies(NextResponse.json({success:false,error:"Audio Referensi belum siap untuk Remix. Upload audio terlebih dahulu."},{status:400}));mode="mureka-reference-duration-remix";providerResponse=await fetch(`${MUREKA_BASE_URL}/v1/song/remix`,{method:"POST",headers:{Authorization:`Bearer ${MUREKA_API_KEY}`,"Content-Type":"application/json",Accept:"application/json"},body:JSON.stringify({upload_audio_id:remixUploadId,lyrics,prompt:remixPrompt,n}),cache:"no-store"});providerData=await readJson(providerResponse);}
   if(!providerResponse.ok){const reason=text(field(providerData,"message")||field(providerData,"error")||field(providerData,"failed_reason")||field(providerData,"detail"));return clearStage2Cookies(NextResponse.json({success:false,stage:"mureka",error:reason?`Mureka menolak proses Stage-2: ${reason}`:`Mureka menolak proses Stage-2 (${providerResponse.status}).`,provider:providerData},{status:providerResponse.status}));}
   const taskId=text(field(providerData,"id")||field(providerData,"task_id")||field(providerData,"taskId"));if(!taskId)return clearStage2Cookies(NextResponse.json({success:false,stage:"mureka",error:"Mureka tidak mengembalikan Task ID.",provider:providerData},{status:502}));const status=text(field(providerData,"status"))||"preparing";const saved=await saveTask(workspace,title,lyrics,remixPrompt,taskId,status,{musicEngine:"mureka",billingProvider:"mureka",stage:mode,hasReference:true,hasVoice:Boolean(vocalId),fullDurationReference:mode==="mureka-reference-duration-remix",provider:providerData});if(!saved)return clearStage2Cookies(NextResponse.json({success:false,error:"Mureka menerima Task ID tetapi Library gagal menyimpan task.",taskId,librarySaved:false},{status:503}));
   return clearStage2Cookies(NextResponse.json({success:true,mode,musicEngine:"mureka",billingProvider:"mureka",taskId,task_id:taskId,status,librarySaved:true,note:vocalId?"Reference + Voice/Vocal aktif melalui song/generate.":"Audio Referensi penuh dikonversi ke Mureka purpose=remix hanya saat Buat Musik; batas 10–350 detik berlaku pada tahap ini.",provider:providerData}));
 }catch(error){console.error("SALVIAN Stage-2 Mureka Remix error",error);return clearStage2Cookies(NextResponse.json({success:false,error:error instanceof Error?error.message:"Gagal menghubungkan Mureka Stage-2."},{status:500}));}
}
