# Deployment no EasyPanel

Este diretório contém os arquivos necessários para fazer o deployment do MixStream no EasyPanel.

## Arquivos

- `Dockerfile`: Configuração para criar a imagem Docker do projeto
- `start-servers.sh`: Script para inicializar os servidores no container
- `docker-compose.yml`: Configuração para rodar o serviço no Docker/EasyPanel

## Como fazer o deployment

1. No EasyPanel, crie um novo projeto
2. Selecione a opção "Custom" ao escolher o template
3. Configure o projeto com as seguintes informações:
   - Portas: 3000, 3002
   - Volume: /app
   - Variáveis de ambiente: NODE_ENV=production

4. No campo Dockerfile, use o conteúdo do arquivo `Dockerfile` deste diretório

5. Clique em "Deploy" e aguarde o processo finalizar

## Verificando o status

- O servidor de vídeo estará disponível na porta 3000
- O servidor de áudio estará disponível na porta 3002
- Você pode verificar os logs do container diretamente pelo painel do EasyPanel

## Observações

- O container está configurado para reiniciar automaticamente em caso de falhas
- Os logs dos dois servidores estarão disponíveis no mesmo container
- As portas 3000 e 3002 precisam estar liberadas no firewall do servidor
