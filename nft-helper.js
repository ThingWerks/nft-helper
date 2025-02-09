debug = true;
cfg = {
    network: {
        interfaceLAN: "enp1s0f1",   // only needed for teaming
        lan: "10.10.0.0/19",        // only needed for teaming
        weighted: false,            // only needed for teaming
        type: "teaming",            // failover
        manager: "ifupdown",        // only needed for failover
    },
    gateways: [
        {
            name: "Jesmark",    // modem name
            ip: "172.16.10.1",  // modem IP address
            weight: 10,         // modem weight - higher = more traffic - only used for round robin
            // routeCmd: "ip route change default via 10.10.0.1",  // only used for 
            comment: [],
            uncomment: [],
        },
        { name: "Cartegena", ip: "172.16.10.3", weight: 10 },
        { name: "Dan", ip: "172.16.10.4", weight: 10 },
        { name: "Hablato", ip: "172.16.10.5", weight: 10 },
        { name: "Randall", ip: "172.16.10.6", weight: 10 },
        { name: "Tim", ip: "172.16.10.7", weight: 10 },
        { name: "Sandy", ip: "172.16.10.10", weight: 10 },
    ],
    monitor: {
        reconnect: 5,          // stable connection duration in seconds
        lan: {
            enable: false,           // enable LAN ip address monitoring
            interval: 0,
            samples: 6,
            delay: 1000,
            latencyWarn: 800,
            latencyError: 1500,
            lossWarn: 50,           // percentage
            lossError: 80,
            reconnect: null,
        },
        wan: {
            interval: 0,
            samples: 4,
            delay: 1000,
            latencyWarn: 800,
            latencyError: 1500,
            lossWarn: 50,           // percentage
            lossError: 80,
            targets: [
                "8.8.8.8",
                "1.1.1.1",
                "199.231.113.38",
            ]
        }
    },
    nft: {
        command: [
            "ip daddr 0.0.0.0/0 ct state new ct mark set numgen",
        ]
    },
};
script = {
    gatewayMonitor: function () {
        for (let x = 0; x < cfg.gateways.length; x++) {
            let gateway = state.gateways[x], config = cfg.gateways[x], lostLan = 0, lostLanPercent = 0, averageLan = 0, averageLanCalc = 0,
                lostWan = 0, lostWanPercent = 0, averageWan = 0, wanTotalSamples = cfg.monitor.wan.samples * cfg.monitor.wan.targets.length
                , averageWanTally = wanTotalSamples, averageWanCalc = 0;
            if (cfg.monitor.lan.enable == true) {
                if (state.gateways[cfg.gateways.length - 1].sampleLAN.length == cfg.monitor.lan.samples) {
                    if (gateway.sampleWAN[cfg.monitor.wan.targets.length - 1].length == cfg.monitor.wan.samples) start();
                }
            } else if (gateway.sampleWAN[cfg.monitor.wan.targets.length - 1].length == cfg.monitor.wan.samples) start();
            function start() {
                if (state.boot == false) {
                    if (x == cfg.gateways.length - 1) state.boot = true;
                    return;
                } else discover();
            }
            function discover() {
                for (let y = 0; y < cfg.monitor.lan.samples; y++) {
                    if (gateway.sampleLAN[y] === false) lostLan++;
                    else averageLan += gateway.sampleLAN[y];
                }
                for (let y = 0; y < cfg.monitor.wan.targets.length; y++) {
                    for (let z = 0; z < cfg.monitor.wan.samples; z++) {
                        if (gateway.sampleWAN[y][z] != false) {
                            averageWan += gateway.sampleWAN[y][z];
                        } else {
                            averageWanTally--;
                            lostWan++;
                        }
                    }
                    lostLanPercent = Math.floor((lostLan / cfg.monitor.lan.samples) * 100);
                    lostWanPercent = Math.floor((lostWan / wanTotalSamples) * 100);
                    averageLanCalc = Math.floor(averageLan / cfg.monitor.lan.samples);
                    averageWanCalc = Math.floor(averageWan / averageWanTally);
                }
                gateway.results = {
                    lanLatency: averageLanCalc, lanLoss: lostLanPercent, wanLatency: averageWanCalc
                    , wanLoss: lostWanPercent, wanSamples: wanTotalSamples, lost: lostWan, pingTotal: averageWan, responses: averageWanTally,
                };
                if (lostLanPercent >= cfg.monitor.lan.lossError) { gateway.status = "offline-LAN loss"; gateway.offline = true; }
                else if (cfg.monitor.lan.lossWarn != undefined && lostLanPercent >= cfg.monitor.lan.lossWarn) gateway.status = "degraded-LAN loss";
                else if (averageLanCalc >= cfg.monitor.lan.latencyError) { gateway.status = "offline-LAN latency"; gateway.offline = true; }
                else if (cfg.monitor.lan.latencyWarn - undefined && averageLanCalc >= cfg.monitor.lan.latencyWarn) gateway.status = "degraded-LAN latency";
                else if (lostWanPercent >= cfg.monitor.wan.lossError) { gateway.status = "offline-WAN loss"; gateway.offline = true; }
                else if (cfg.monitor.wan.lossWarn != undefined && lostWanPercent >= cfg.monitor.wan.lossWarn) gateway.status = "degraded-WAN loss";
                else if (averageWanCalc >= cfg.monitor.wan.latencyError) { gateway.status = "offline-WAN latency"; gateway.offline = true; }
                else if (cfg.monitor.wan.latencyWarn != undefined && averageWanCalc >= cfg.monitor.wan.latencyWarn) gateway.status = "degraded-WAN latency";
                else gateway.status = "online";
                report();
            }
            function report() {
                if (gateway.statusPrevious != gateway.status) {
                    if (gateway.statusPrevious == "online") gateway.timer = time.epoch;
                    if (gateway.status == "online" && gateway.statusPrevious != undefined) {
                        if (time.epoch - gateway.timer >= (cfg.monitor.reconnect)) {
                            console.log("gateway: " + config.name + " is " + gateway.status + "  -  " + (cfg.monitor.lan.enable ? "LAN average: " + averageLanCalc
                                + " LAN loss: " + lostLanPercent + "%, " : "") + "WAN Average: " + averageWanCalc + " WAN Loss: "
                                + lostWanPercent + "%" + ((gateway.statusPrevious.includes("offline")) ? "  - Was offline for " : "  - Was degraded for ")
                                + (time.epoch - gateway.timer) + " seconds");
                        }
                    } else {
                        console.log("gateway: " + config.name + " is " + gateway.status + "  -  " + (cfg.monitor.lan.enable ? "LAN average:" + averageLanCalc
                            + " LAN loss: " + lostLanPercent + "%, " : "") + "WAN Average: " + averageWanCalc + " WAN Loss: " + lostWanPercent + "%");
                    }
                    if (gateway.status.includes("online") && gateway.offline == true || gateway.statusPrevious == undefined
                        || gateway.status.includes("offline")) {
                        if (gateway.status == "online") gateway.offline = false;
                        clearTimeout(state.nfTables.timer);
                        state.nfTables.timer = setTimeout(() => { script.nft(); }, 3e3);
                    }
                    gateway.statusPrevious = gateway.status;
                }
            }

        }
    },
    pingLan: function () {
        let wait = 0;
        for (let x = 0; x < cfg.gateways.length; x++) {
            setTimeout(() => {
                //       console.log("pinging wan " + cfg.gateways[x].name + " (" + cfg.gateways[x].ip
                //            + ") with mark: " + (x + 1));
                app.pingAsync(cfg.gateways[x].ip, state.gateways[x].sampleLAN, state.sampleLAN, 0);
                if (x == cfg.gateways.length - 1) {
                    if (state.sampleLAN < cfg.monitor.lan.samples - 1) state.sampleLAN++;
                    else state.sampleLAN = 0;
                    setTimeout(() => { script.pingLan(); }, cfg.monitor.lan.interval * 1e3);
                }
            }, wait);
            wait += cfg.monitor.lan.delay;
        }
    },
    pingWan: function () {
        let wait = 0;
        for (let x = 0; x < cfg.gateways.length; x++) {
            for (let y = 0; y < cfg.monitor.wan.targets.length; y++) {
                setTimeout(() => {
                    //     console.log("pinging wan " + cfg.gateways[x].name + " (" + cfg.monitor.wan.targets[y]
                    //          + ") with mark: " + (x + 1));
                    app.pingAsync(cfg.monitor.wan.targets[y], state.gateways[x].sampleWAN[y], state.sampleWAN, (x + 1));
                    if (x == cfg.gateways.length - 1 && y == cfg.monitor.wan.targets.length - 1) {
                        if (state.sampleWAN < cfg.monitor.wan.samples - 1) state.sampleWAN++;
                        else state.sampleWAN = 0;
                        setTimeout(() => { script.pingWan(); }, cfg.monitor.wan.interval * 1e3);
                    }
                }, wait);
                wait += cfg.monitor.wan.delay;
            }
        }
    },
    pingWanRound: function () {
        let wait = 0;
        for (let y = 0; y < cfg.monitor.wan.targets.length; y++) {
            for (let x = 0; x < cfg.gateways.length; x++) {
                setTimeout(() => {
                    //    console.log("pinging wan " + cfg.gateways[x].name + " (" + cfg.monitor.wan.targets[y]
                    //        + ") with mark: " + (x + 1)); 
                    app.pingAsync(cfg.monitor.wan.targets[y], state.gateways[x].sampleWAN[y], state.sampleWAN, (x + 1));
                    if (x == cfg.gateways.length - 1 && y == cfg.monitor.wan.targets.length - 1) {
                        if (state.sampleWAN < cfg.monitor.wan.samples - 1) state.sampleWAN++;
                        else state.sampleWAN = 0;
                        setTimeout(() => { script.pingWanRound(); }, cfg.monitor.wan.interval * 1e3);
                    }
                }, wait);
                wait += cfg.monitor.wan.delay;
            }
        }
    },
    nft: function () {
        let sequence = [], order = " map { ";
        state.nfTables.data = fs.readFileSync('/etc/nftables.conf', 'utf-8').split(/\r?\n/);
        switch (cfg.network.type) {
            case "failover":
                switch (ColorMode.network.manager) {
                    case "netplan":
                        state.nfTables.data = fs.readFileSync('/etc/netplan/10-dhcp-all-interfaces.yaml', 'utf-8').split(/\r?\n/);
                        for (let x = 0; x < state.nfTables.data.length; x++) {
                            if (state.nfTables.data[x].includes("via: ")) {
                                console.log("gateway found in netplan config, line: " + x);
                                state.nfTables.line = x;
                                break;
                            }
                        }

                        break;
                }
                break;
            case "teaming":
                state.nfTables.total = 0;
                for (let x = 0; x < state.gateways.length; x++) {
                    //   console.log(state.gateways[x].status)
                    if (state.gateways[x].status == undefined || state.gateways[x].status.includes("offline") == false) sequence.push(x);
                }
                for (let x = 0; x < state.nfTables.data.length; x++) {
                    if (state.nfTables.data[x].includes(cfg.nft.command[0])) {
                        //  console.log("nft command found on line: " + x);
                        state.nfTables.line = x;
                        break;
                    }
                }
                if (state.nfTables.line != null) {
                    if (cfg.network.weighted == true) {
                        let weights = script.calcWeight(sequence);
                        let weightStart = 0, weightEnd = weights[0];
                        for (let x = 0; x < sequence.length; x++) {
                            order += (weightStart) + "-" + (weightEnd) + " : " + (sequence[x] + 1) + (x < (sequence.length - 1) ? ", " : " }");
                            weightStart += weights[x] + (x == 0 ? 1 : 0);
                            weightEnd += weights[x];
                        }
                        //  console.log("modifying nftables.conf");
                        state.nfTables.data[state.nfTables.line] = "\t" + cfg.nft.command[0] + " random mod 100 " + order;
                    } else {
                        for (let x = 0; x < sequence.length; x++)
                            order += x + " : " + (sequence[x] + 1) + (x < (sequence.length - 1) ? ", " : " }");
                        //  console.log("modifying nftables.conf");
                        state.nfTables.data[state.nfTables.line] = "\t" + cfg.nft.command[0] + " inc mod " + sequence.length + order;
                    }
                } else console.log("error, nftables doesnt have referenced command");
                break;
        }
        if (state.nfTables.line != null) {
            //  console.log(state.nfTables.data);
            //   console.log("saving new nftables.conf");
            fs.writeFileSync('/etc/nftables.tmp', state.nfTables.data.join('\n'), 'utf-8');
            cp.execSync("cp /etc/nftables.tmp /etc/nftables.conf");
            console.log("updating nftables");
            cp.execSync("nft -f /etc/nftables.conf");
        }
    },
    checkRoutes: function () {
        //    cp.execSync("sudo tee -a /etc/iproute2/rt_tables").toString();
        let rt_tables = fs.readFileSync("/etc/iproute2/rt_tables", 'utf8');
        let ip_rules = cp.execSync("ip rule show").toString();
        let routes = "";
        for (let x = 0; x < cfg.gateways.length; x++) {
            if (rt_tables.includes((x + 1) + " gw" + (x + 1))) console.log("rt_tables includes gateway: " + x);
            else {
                console.log("rt_tables doesnt have gateway: " + x + ", creating...");
                cp.execSync('echo "' + (x + 1) + ' gw' + (x + 1) + '" | tee -a /etc/iproute2/rt_tables');
            }
            if (ip_rules.includes("lookup gw" + (x + 1))) console.log("ip_rules includes gateway: " + x);
            else {
                console.log("ip_rules doesnt have gateway: " + x + ", creating...");
                cp.execSync("ip rule add fwmark " + (x + 1) + " table gw" + (x + 1));
            }
            try {
                routes = cp.execSync("ip route show table gw" + (x + 1)).toString();
                console.log("ip_route includes gateway: " + x);
                cp.execSync("ip route del default table gw" + (x + 1));
                cp.execSync("ip route add default via " + cfg.gateways[x].ip + " table gw" + (x + 1));
            } catch {
                console.log("ip_route doesnt have gateway: " + x + ", creating...");
                cp.execSync("ip route add default via " + cfg.gateways[x].ip + " table gw" + (x + 1));
                cp.execSync("ip route add " + cfg.network.lan + " dev " + cfg.network.interfaceLAN + " table gw" + (x + 1));
            }
        }
    },
    calcWeight: function (sequence) {
        let prep = [];
        for (let x = 0; x < sequence.length; x++) prep.push(cfg.gateways[x].weight);
        return calc(prep);
        function calc(weights) {
            const totalShares = 100;
            const totalWeight = weights.reduce((acc, weight) => acc + weight, 0);
            const shareDistribution = weights.map((weight) => {
                const share = Math.floor((weight / totalWeight) * (totalShares - 1));
                return share;
            });
            let remainingShares = totalShares - 1 - shareDistribution.reduce((acc, share) => acc + share, 0);
            const sortedWeights = weights.map((weight, index) => ({ weight, index }));
            sortedWeights.sort((a, b) => b.weight - a.weight);
            let i = 0;
            while (remainingShares > 0) {
                const { index } = sortedWeights[i];
                shareDistribution[index]++;
                remainingShares--;
                if (i + 1 < sortedWeights.length && sortedWeights[i].weight === sortedWeights[i + 1].weight) {
                    shareDistribution[sortedWeights[i + 1].index]++;
                    remainingShares--;
                    i++;
                }
                i++;
            }
            return shareDistribution;
        }
    },
}
app = {
    pingAsync: function (address, result, count, mark) {
        spawn("ping", ["-c 1", address, "-W 2", "-m " + mark], undefined, (data, object) => {         // data is the incoming data from the spawn close event (final data). Obj is the original options sent for the future CB
            if (data.includes("64 bytes from")) object.result[object.count] = Number(parse(data, "time=", " "));
            else object.result[object.count] = false;
        }, { result, count });      // the object that will be sent to the spawn and will be forwarded to the CB above (passthrough object) 
    },
}
sys = {
    boot: function () {
        // is nft enabled    /etc/systemd/system/sysinit.target.wants/nftables.service
        console.log("booting...");
        if (fs.readFileSync("/proc/sys/net/ipv4/ip_forward", 'utf8').includes("0")) {
            console.log("forwarding not enabled!! Enabling now");
            cp.execSync(" sudo sed -i 's/#net.ipv4.ip_forward=1/net.ipv4.ip_forward=1/' /etc/sysctl.conf");
            cp.execSync("echo 1 | sudo tee /proc/sys/net/ipv4/ip_forward");
            cp.execSync("sudo sysctl -p");
        } else console.log("forwarding is enabled");
        script.checkRoutes();
        /*
        try {
            nv = JSON.parse(fs.readFileSync(path.app + "router-nv.json", 'utf8'));
            console.log("read NV data");
            console.log(nv);
        } catch {
            console.log("nv file does not exist, creating");
            fs.writeFileSync(path.app + "router-nv.json", JSON.stringify(nv));
        }
            */
        if (cfg.monitor.lan.enable == true) script.pingLan();
        setTimeout(() => { script.pingWanRound(); }, 500);
        setInterval(() => { script.gatewayMonitor(); }, 1e3);
    },
    init: function () {
        sys.lib();
        nv = {};
        state = {
            boot: false,
            startDelay: 5000,
            sampleLAN: 0,
            sampleWAN: 0,
            spawn: [],
            gateways: [],
            nfTables: {
                data: "",
                line: null,
                total: 0,
                timer: null,
            },
        }
        for (let x = 0; x < cfg.gateways.length; x++) {
            state.gateways.push({
                status: undefined,
                offline: false,
                statusPrevious: undefined,
                results: {},
                sampleLAN: [],
                sampleWAN: [],
                timer: time.epoch,
                changes: 0,
                drops: 0,
            });
            cfg.monitor.wan.targets.forEach(_ => {
                state.gateways[x].sampleWAN.push([])
            });
        }
        sys.boot();
    },
    lib: function () {
        os = require('os');
        cp = require('child_process');
        fs = require('fs');
        events = require('events');
        em = new events.EventEmitter();
        path = {
            lib: require('path'),
            user: os.userInfo().username,
            app: require('path').dirname(require.main.filename) + "/",
            appFile: require('path').basename(__filename).slice(0, -3),
            home: os.homedir(),
            working: os.homedir() + "/apps/",
            system: "/apps/",
        };
        time = {
            boot: null,
            get epochMil() { return Date.now(); },
            get mil() { return new Date().getMilliseconds(); },
            get stamp() {
                return ("0" + this.month).slice(-2) + "-" + ("0" + this.day).slice(-2) + " "
                    + ("0" + this.hour).slice(-2) + ":" + ("0" + this.min).slice(-2) + ":"
                    + ("0" + this.sec).slice(-2) + "." + ("00" + this.mil).slice(-3);
            },
            sync: function () {
                let date = new Date();
                this.epoch = Math.floor(Date.now() / 1000);
                this.epochMin = Math.floor(Date.now() / 1000 / 60);
                this.month = date.getMonth() + 1;   // 0 based
                this.day = date.getDate();          // not 0 based
                this.dow = date.getDay() + 1;       // 0 based
                this.hour = date.getHours();
                this.min = date.getMinutes();
                this.sec = date.getSeconds();
            },
            startTime: function () {
                function syncAndSchedule() {
                    time.sync();
                    if (time.boot === null) time.boot = 0;
                    let now = Date.now(), nextInterval = 1000 - (now % 1000);
                    setTimeout(() => { syncAndSchedule(); time.boot++; }, nextInterval);
                }
                syncAndSchedule();
            },
        };
        spawn = function (command, args, onData, onClose, object) {
            let data = "";
            let process = cp.spawn(command, args, object);
            process.stdout.on('data', (buf) => {
                data += buf;
                if (typeof onData === 'function') { onData(buf, object); }
            });
            process.on('close', (code) => {
                const index = state.spawn.indexOf(process);
                if (index !== -1) { state.spawn.splice(index, 1); }
                if (typeof onClose === 'function') { onClose(data, object); }
            });
            // process.stderr.on('data', (buf) => { console.log(buf); });
            state.spawn.push(process);
        };
        parse = function (data, startString, endChar, len) {  // will accept string or regex
            let sort, pos = 0, regx = new RegExp(`${startString}`, "g");
            if (!len) len = startString.length;
            let obj = [];
            while ((sort = regx.exec(data)) !== null) {
                if (obj[pos] == undefined) obj.push({});
                obj[pos].value = sr();
                function sr() {
                    return data.substring(sort.index + len, getEnd());
                    function getEnd() {
                        for (let x = sort.index + len; x < data.length; x++) {
                            if (data[x] == endChar) return x;
                        }
                    }
                }
                pos++;
            }
            // if (obj[0] != undefined && Number(obj[0].value) != NaN) return Number(obj[0].value);
            //  else return undefined
            if (obj[0] != undefined) return obj[0].value;
        };
        try {
            require.resolve("express");
            if (debug) {
                expressLib = require("express");
                express = expressLib();
                express.get("/", function (request, response) { { response.send({ data: state.gateways }) }; });
                serverWeb = express.listen(20001, function () { });
            }
        } catch (e) { debug = false; };
        time.startTime();
    }
}
sys.init();
