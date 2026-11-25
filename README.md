# HarvestGuard Rwanda

Live site: **https://harvestguard.quentintech.tech**
Demo video: https://youtube/wxwBa4q7N-I

This is a web app that helps smallholder maize farmers in rwanda record their harvest, drying, storage and losses, and decide when it is safe to dry maize outdoors, using a live weather forecast.

## The problem and who it is for

After the harvest, a large share of stored maize is lost to mould, insects, rodents and poor drying. Most smallhoplder farmers do not write these losses down, so they can't see where the grain goes or what to change. HarvestGuard gices a farmer one simple place to: 

- record each harvest and what happens to it afterwards
- see how much is left and what percentage was really lost
- get warnings (wet grain, long storage in ordinary bags, full or un-inspected  stores)
- check the rain and humidity forecast before spreading maize to dry.  

**Target users:** smallholder farmers and farmer cooperatives growing maize in rwanda. The first bersion is in english and covers amize only.

## Technology

Frontend: HTML, CSS and Vanilla JavaScript
Backend: Node.js 22+ and Express 5
Database: PostgresSQL 17. Production: Supabase
Weather: [Open-Meto](https://open-meteo.com/) forecast API
Servers: HAProxy load balancer, two Ngix + Node.js web servers (ubuntu)

