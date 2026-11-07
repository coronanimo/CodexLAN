using System;
using System.Collections.Generic;
using System.IO;
using System.Net;
using CodexLan.NetworkWatchV2;

public static class NetworkWatchTests {
    static int assertions;
    static void Check(bool ok,string description) { assertions++; if(!ok) throw new Exception(description); }
    static void Put16(byte[] b,int p,int n) { b[p]=(byte)(n>>8); b[p+1]=(byte)n; }
    static void Put32(byte[] b,int p,uint n) { b[p]=(byte)(n>>24); b[p+1]=(byte)(n>>16); b[p+2]=(byte)(n>>8); b[p+3]=(byte)n; }
    static void Addr(byte[] b,int p,string ip) { byte[] a=IPAddress.Parse(ip).GetAddressBytes(); Buffer.BlockCopy(a,0,b,p,a.Length); }
    public static byte[] Ra(int life,byte[] options) {
        var b=new byte[70+options.Length];
        b[6]=0x02; b[11]=1; b[12]=0x86; b[13]=0xdd;
        b[14]=0x60; Put16(b,18,16+options.Length); b[20]=58; b[21]=255;
        Addr(b,22,"fe80::1"); Addr(b,38,"ff02::1"); b[54]=134; Put16(b,60,life);
        Buffer.BlockCopy(options,0,b,70,options.Length); return b;
    }
    public static byte[] Options() {
        var b=new byte[80];
        b[0]=3; b[1]=4; b[2]=64; b[3]=0xc0; Put32(b,4,3600); Put32(b,8,0); Addr(b,16,"2001:db8:1234::");
        b[32]=25; b[33]=3; Put32(b,36,0); Addr(b,40,"2001:db8::53");
        b[56]=24; b[57]=1; Put32(b,60,0);
        b[64]=31; b[65]=2; Put32(b,68,0); b[72]=3; b[73]=108; b[74]=97; b[75]=110;
        return b;
    }
    public static byte[] Dns(bool response) {
        // example.com A, with a compressed answer owner name.
        byte[] name={7,101,120,97,109,112,108,101,3,99,111,109,0};
        int size=12+name.Length+4+(response?16:0);
        var b=new byte[42+size]; b[6]=2; b[11]=2; b[12]=8; b[14]=0x45;
        Put16(b,16,28+size); b[23]=17; Addr(b,26,response?"192.168.1.1":"192.168.1.50"); Addr(b,30,response?"192.168.1.50":"192.168.1.1");
        Put16(b,34,response?53:53000); Put16(b,36,response?53000:53); Put16(b,38,8+size);
        Put16(b,42,0x1234); b[44]=(byte)(response?0x81:1); Put16(b,46,1); Put16(b,48,response?1:0);
        Buffer.BlockCopy(name,0,b,54,name.Length); int p=54+name.Length; Put16(b,p,1); Put16(b,p+2,1); p+=4;
        if(response) { b[p]=0xc0; b[p+1]=12; Put16(b,p+2,1); Put16(b,p+4,1); Put32(b,p+6,60); Put16(b,p+10,4); Addr(b,p+12,"192.0.2.5"); }
        return b;
    }
    public static byte[] Capture() {
        using(var memory=new MemoryStream()) using(var writer=new BinaryWriter(memory)) {
            writer.Write(0x0a0d0d0a); writer.Write(28); writer.Write(0x1a2b3c4d); writer.Write((ushort)1); writer.Write((ushort)0); writer.Write((long)-1); writer.Write(28);
            writer.Write(1); writer.Write(20); writer.Write((ushort)1); writer.Write((ushort)0); writer.Write(65535); writer.Write(20);
            foreach(byte[] frame in new byte[][] {Ra(1800,new byte[0]),Ra(0,Options()),Dns(false),Dns(true)}) {
                int padded=(frame.Length+3)&~3, size=32+padded;
                writer.Write(6); writer.Write(size); writer.Write(0); writer.Write(0); writer.Write(0); writer.Write(frame.Length); writer.Write(frame.Length); writer.Write(frame);
                writer.Write(new byte[padded-frame.Length]); writer.Write(size);
            }
            return memory.ToArray();
        }
    }
    public static string Run() {
        var d=new Decoder(); DateTime now=DateTime.Now;
        d.Feed(Ra(1800,new byte[0]),"LAN",now);
        Check(d.Events.ToArray()[0].Title=="发现 RA 路由器","RA discovery");
        byte[] changed=Ra(1800,new byte[0]); changed[11]=3; d.Feed(changed,"LAN",now);
        Check(d.Events.ToArray()[1].Title=="路由器 MAC 变化","RA MAC change");
        byte[] other=Ra(1800,new byte[0]); other[37]=2; d.Feed(other,"LAN",now);
        Check(d.Events.ToArray()[2].Title=="发现额外 RA 路由器","Multiple RA sources");
        d.Feed(Ra(0,Options()),"LAN",now);
        var events=d.Events.ToArray();
        Check(events[3].Title=="默认路由撤销通告","Router withdrawal");
        Check(events[4].Title=="前缀弃用通告" && events[4].Detail.Contains("2001:db8:1234::/64"),"Prefix deprecation");
        Check(events[5].Title=="RA DNS 撤销" && events[5].Detail.Contains("2001:db8::53"),"RDNSS withdrawal");
        Check(events[6].Title=="指定路由撤销","RIO withdrawal");
        Check(events[7].Title=="搜索域撤销" && events[7].Detail.Contains("lan"),"DNSSL withdrawal");
        d.Feed(Dns(false),"LAN",now); d.Feed(Dns(true),"LAN",now);
        events=d.Events.ToArray();
        Check(events[8].Title=="DNS 查询" && events[8].Detail.Contains("example.com"),"DNS question");
        Check(events[9].Detail.Contains("192.0.2.5") && events[9].Detail.Contains("TTL=60"),"Compressed DNS answer");
        var fail=Dns(true); fail[45]=3; d.Feed(fail,"LAN",now);
        Check(d.Events.ToArray()[10].Title.Contains("NXDOMAIN"),"DNS error");
        byte[] invalid=Ra(100,new byte[0]); invalid[21]=64; d.Feed(invalid,"LAN",now);
        Check(d.Events.ToArray()[11].Title=="RA 格式异常","Invalid RA hop limit");
        var bad=Ra(0,new byte[]{25,0}); long malformed=d.Malformed; d.Feed(bad,"LAN",now);
        Check(d.Malformed>malformed,"Zero size option must terminate");
        byte[] cyclic=Dns(false); cyclic[54]=0xc0; cyclic[55]=12;
        malformed=d.Malformed; d.Feed(cyclic,"LAN",now); Check(d.Malformed>malformed,"Cyclic DNS pointer must terminate");
        var expiry=new Decoder(); expiry.Feed(Ra(1,new byte[0]),"LAN",now); expiry.Tick(now.AddSeconds(2));
        Check(expiry.Events.ToArray()[1].Kind=="EXPIRE","Observed lifetime expiry");
        var zero=new Decoder(); zero.Feed(Ra(0,new byte[0]),"LAN",now); zero.Tick(now.AddDays(1));
        Check(zero.Events.Count==1,"Withdrawal must not create a later expiry");
        byte[] frame=Ra(20,new byte[0]), payload=new byte[34+frame.Length];
        payload[0]=1; payload[8]=1; payload[16]=15; payload[32]=(byte)frame.Length;
        Buffer.BlockCopy(frame,0,payload,34,frame.Length);
        var native=new Decoder(); native.Pktmon(payload,now); native.Pktmon(payload,now);
        Check(native.Events.Count==1 && native.Events.ToArray()[0].Source.Contains("15"),"ETW payload and duplicate suppression");
        var dnsKinds=new Decoder();
        byte[] multicast=Dns(false); Put16(multicast,36,5353); dnsKinds.Feed(multicast,"LAN",now);
        byte[] llmnr=Dns(false); Put16(llmnr,36,5355); dnsKinds.Feed(llmnr,"LAN",now);
        Check(dnsKinds.Events.ToArray()[0].Kind=="mDNS" && dnsKinds.Events.ToArray()[1].Kind=="LLMNR","Multicast name resolution classification");
        var positive=new Decoder(); byte[] options=Options(); Put32(options,36,30);
        positive.Feed(Ra(30,options),"LAN",now);
        Check(positive.Events.ToArray()[2].Title=="RA 下发 DNS","Positive RDNSS lifetime");
        byte[] deprecated=Options(); Put32(deprecated,4,0); positive.Feed(Ra(30,deprecated),"LAN",now);
        Check(positive.Events.ToArray()[6].Title=="前缀撤销通告","Prefix valid lifetime zero");
        var ipv6dns=new Decoder(); byte[] v4=Dns(true), v6=new byte[v4.Length+20];
        v6[6]=2; v6[12]=0x86; v6[13]=0xdd; v6[14]=0x60; Put16(v6,18,v4.Length-34); v6[20]=17; v6[21]=64;
        Addr(v6,22,"2001:db8::53"); Addr(v6,38,"2001:db8::50"); Buffer.BlockCopy(v4,34,v6,54,v4.Length-34);
        ipv6dns.Feed(v6,"LAN",now);
        Check(ipv6dns.Events.Count==1 && ipv6dns.Events.ToArray()[0].Source.Contains("[2001:db8::53]:53"),"IPv6 DNS parsing and endpoint formatting");
        // Every truncated packet length must be handled without crashing the monitor.
        for(int length=0;length<frame.Length;length++) { byte[] truncated=new byte[length]; Buffer.BlockCopy(frame,0,truncated,0,length); d.Feed(truncated,"LAN",now); }
        Check(true,"Truncated packet handling");
        return assertions+" network-watch assertions passed";
    }
}
