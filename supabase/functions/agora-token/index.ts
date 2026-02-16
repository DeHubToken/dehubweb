import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Agora token generation utilities
// Based on https://github.com/AgoraIO/Tools/tree/main/DynamicKey/AgoraDynamicKey

const VERSION = "007";
const VERSION_LENGTH = 3;

// Privileges
const PRIVILEGES = {
  JOIN_CHANNEL: 1,
  PUBLISH_AUDIO_STREAM: 2,
  PUBLISH_VIDEO_STREAM: 3,
  PUBLISH_DATA_STREAM: 4,
};

// Roles
const ROLE = {
  PUBLISHER: 1,
  SUBSCRIBER: 2,
};

// Helper functions for token generation
function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function packUint16(value: number): Uint8Array {
  const buffer = new ArrayBuffer(2);
  const view = new DataView(buffer);
  view.setUint16(0, value, true);
  return new Uint8Array(buffer);
}

function packUint32(value: number): Uint8Array {
  const buffer = new ArrayBuffer(4);
  const view = new DataView(buffer);
  view.setUint32(0, value, true);
  return new Uint8Array(buffer);
}

function packString(str: string): Uint8Array {
  const encoder = new TextEncoder();
  const strBytes = encoder.encode(str);
  const lenBytes = packUint16(strBytes.length);
  const result = new Uint8Array(lenBytes.length + strBytes.length);
  result.set(lenBytes);
  result.set(strBytes, lenBytes.length);
  return result;
}

function packMapUint32(map: Map<number, number>): Uint8Array {
  const parts: Uint8Array[] = [];
  parts.push(packUint16(map.size));
  
  for (const [key, value] of map) {
    parts.push(packUint16(key));
    parts.push(packUint32(value));
  }
  
  const totalLength = parts.reduce((sum, arr) => sum + arr.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}

async function hmacSha256(key: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
  const keyBuffer = key.buffer.slice(key.byteOffset, key.byteOffset + key.byteLength) as ArrayBuffer;
  const dataBuffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
  
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyBuffer,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", cryptoKey, dataBuffer);
  return new Uint8Array(signature);
}

function concatArrays(...arrays: Uint8Array[]): Uint8Array {
  const totalLength = arrays.reduce((sum, arr) => sum + arr.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const arr of arrays) {
    result.set(arr, offset);
    offset += arr.length;
  }
  return result;
}

async function generateAccessToken(
  appId: string,
  appCertificate: string,
  channelName: string,
  uid: number,
  role: number,
  privilegeExpiredTs: number
): Promise<string> {
  const encoder = new TextEncoder();
  
  // Generate message
  const salt = Math.floor(Math.random() * 100000000);
  const ts = Math.floor(Date.now() / 1000);
  
  // Build privileges map
  const privileges = new Map<number, number>();
  privileges.set(PRIVILEGES.JOIN_CHANNEL, privilegeExpiredTs);
  
  if (role === ROLE.PUBLISHER) {
    privileges.set(PRIVILEGES.PUBLISH_AUDIO_STREAM, privilegeExpiredTs);
    privileges.set(PRIVILEGES.PUBLISH_VIDEO_STREAM, privilegeExpiredTs);
    privileges.set(PRIVILEGES.PUBLISH_DATA_STREAM, privilegeExpiredTs);
  }
  
  // Pack message content
  const saltBytes = packUint32(salt);
  const tsBytes = packUint32(ts);
  const privilegesBytes = packMapUint32(privileges);
  
  const messageContent = concatArrays(saltBytes, tsBytes, privilegesBytes);
  
  // Pack the full message
  const appIdBytes = packString(appId);
  const channelBytes = packString(channelName);
  const uidBytes = packString(String(uid));
  const messageContentLen = packUint16(messageContent.length);
  
  const toSign = concatArrays(
    appIdBytes,
    channelBytes,
    uidBytes,
    messageContentLen,
    messageContent
  );
  
  // Sign with HMAC-SHA256
  const signature = await hmacSha256(encoder.encode(appCertificate), toSign);
  
  // Build final token
  const signatureBytes = concatArrays(packUint16(signature.length), signature);
  
  const content = concatArrays(
    signatureBytes,
    appIdBytes,
    channelBytes,
    uidBytes,
    messageContentLen,
    messageContent
  );
  
  const token = VERSION + bytesToBase64(content);
  
  return token;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const AGORA_APP_ID = Deno.env.get("AGORA_APP_ID");
    const AGORA_APP_CERTIFICATE = Deno.env.get("AGORA_APP_CERTIFICATE");

    if (!AGORA_APP_ID || !AGORA_APP_CERTIFICATE) {
      console.error("Missing Agora credentials");
      return new Response(
        JSON.stringify({ error: "Agora credentials not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { channelName, uid, role: requestedRole } = await req.json();

    if (!channelName) {
      return new Response(
        JSON.stringify({ error: "channelName is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Default to 0 for uid if not provided (Agora will assign)
    const userUid = uid || 0;
    
    // Role: publisher (speaker) or subscriber (listener)
    const role = requestedRole === "publisher" ? ROLE.PUBLISHER : ROLE.SUBSCRIBER;

    // Token expires in 24 hours
    const expirationTimeInSeconds = 86400;
    const currentTimestamp = Math.floor(Date.now() / 1000);
    const privilegeExpiredTs = currentTimestamp + expirationTimeInSeconds;

    console.log(`Generating token for channel: ${channelName}, uid: ${userUid}, role: ${requestedRole}`);

    const token = await generateAccessToken(
      AGORA_APP_ID,
      AGORA_APP_CERTIFICATE,
      channelName,
      userUid,
      role,
      privilegeExpiredTs
    );

    console.log(`Token generated successfully for channel: ${channelName}`);

    return new Response(
      JSON.stringify({ 
        token, 
        appId: AGORA_APP_ID,
        channel: channelName,
        uid: userUid 
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error generating Agora token:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
