// Simple call notification system - bypass all the complex polling
import { supabase } from '@/integrations/supabase/client';

export const simpleCallCheck = async (userAddress: string) => {
  
  try {
    // Check for any ringing calls for this user. Stored addresses are
    // lower-case and the wallet can arrive checksummed, so lower it here.
    const { data: calls, error } = await supabase
      .from('call_sessions')
      .select('id,caller_address,recipient_address,status,call_type,created_at')
      .eq('recipient_address', userAddress.toLowerCase())
      .eq('status', 'ringing')
      .order('created_at', { ascending: false })
      .limit(1);
    
    if (error) {
      console.error('❌ Database error:', error);
      return null;
    }
    
    
    if (calls && calls.length > 0) {
      return calls[0];
    } else {
      return null;
    }
  } catch (error) {
    console.error('❌ Call check error:', error);
    return null;
  }
};

// Test function to manually trigger call check
export const testCallDetection = async (userAddress: string) => {
  console.log('🧪 Testing call detection...');
  
  const call = await simpleCallCheck(userAddress);
  
  if (call) {
    console.log('🎉 SUCCESS: Call detected!', call);
    return call;
  } else {
    console.log('❌ FAILED: No call detected');
    return null;
  }
};

// Function to check all recent call sessions
export const debugAllCalls = async () => {
  console.log('🔍 Debugging all call sessions...');
  
  try {
    const { data: allCalls, error } = await supabase
      .from('call_sessions')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(10);
    
    if (error) {
      console.error('❌ Error fetching all calls:', error);
      return;
    }
    
    console.log('📊 All recent calls:', allCalls);
    
    // Group by status
    const byStatus = allCalls.reduce((acc, call) => {
      acc[call.status] = (acc[call.status] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    console.log('📈 Calls by status:', byStatus);
    
    return allCalls;
  } catch (error) {
    console.error('❌ Debug error:', error);
  }
};
