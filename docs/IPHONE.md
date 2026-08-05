# iPhone Usage

No iOS package is required. Use the web interface in Safari and optionally add it to the Home Screen.

## Trusted LAN

1. Keep the Windows launcher running.
2. Connect the iPhone and Windows host to the same trusted Wi-Fi.
3. Open the exact address printed by the launcher, for example `http://192.168.1.20:8687`.
4. Sign in. In Safari, choose **Share > Add to Home Screen** if desired.

If it does not connect, check the IP and port, Windows Private-network profile, firewall rule, guest/client isolation, VPN routing, and whether the Windows host is asleep. See [TROUBLESHOOTING.md](TROUBLESHOOTING.md).

## Remote access

Do not expose the plain HTTP port directly to the internet. Login data, chats, commands, and files would cross the network without transport encryption. Use a trusted HTTPS reverse proxy or private-network gateway and allow only trusted users. Read [SECURITY.md](../SECURITY.md) and [DEPLOYMENT.md](DEPLOYMENT.md) first.

CGNAT can make router port forwarding unavailable, and some routers do not support NAT loopback. Those network conditions do not justify bypassing HTTPS or widening the service's trust boundary.
