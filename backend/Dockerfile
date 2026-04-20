FROM ghcr.io/puppeteer/puppeteer:latest

WORKDIR /usr/src/app

COPY package*.json ./
RUN npm ci

COPY . .

# Ensure pptruser has ownership
USER root
RUN chown -R pptruser:pptruser /usr/src/app
# Make uploads directory and ensure it has correct permissions
RUN mkdir -p /usr/src/app/uploads && chown -R pptruser:pptruser /usr/src/app/uploads
USER pptruser

EXPOSE 5000

CMD [ "npm", "start" ]
