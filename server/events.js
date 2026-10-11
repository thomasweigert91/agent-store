// Server-Sent-Events: schickt Live-Updates (Status, Text-Streams) an alle offenen Browser-Tabs.
const clients = new Set();

export function addClient(res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });
  res.write('retry: 2000\n\n');
  clients.add(res);
  const ping = setInterval(() => res.write(': ping\n\n'), 20000);
  res.on('close', () => {
    clearInterval(ping);
    clients.delete(res);
  });
}

export function emit(type, data) {
  const payload = `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of clients) res.write(payload);
}
