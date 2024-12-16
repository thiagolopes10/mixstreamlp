FROM node:18-slim

# Instalar dependências necessárias
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

# Criar diretório da aplicação
WORKDIR /app

# Copiar arquivos do projeto
COPY . .

# Instalar dependências do Node.js
RUN npm install

# Expor as portas necessárias
EXPOSE 3000 3002

# Definir o script de inicialização como executável
COPY docker/start-servers.sh /app/start-servers.sh
RUN chmod +x /app/start-servers.sh

# Comando para iniciar os servidores
CMD ["/app/start-servers.sh"]
