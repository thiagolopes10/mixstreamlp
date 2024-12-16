#!/bin/bash

# Iniciar o servidor de vídeo em segundo plano
node server.js &

# Iniciar o servidor de áudio em segundo plano
node test-server.js &

# Manter o container rodando e capturar sinais de término
trap "exit" SIGINT SIGTERM
while true; do
    sleep 1
done
