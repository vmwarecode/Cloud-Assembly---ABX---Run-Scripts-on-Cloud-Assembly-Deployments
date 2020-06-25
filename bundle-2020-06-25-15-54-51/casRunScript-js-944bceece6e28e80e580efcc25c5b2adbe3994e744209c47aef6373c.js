//#--------------------------------------------------------#
//#                     Spas Kaloferov                     #
//#                   www.kaloferov.com                    #
//# bit.ly/The-Twitter      Social     bit.ly/The-LinkedIn #
//# bit.ly/The-Gitlab        Git         bit.ly/The-Github #
//# bit.ly/The-BSD         License          bit.ly/The-GNU #
//#--------------------------------------------------------#

  //#
  //#       VMware Cloud Assembly ABX Code Sample          
  //#
  //# [Info] 
  //#   - Action to run SSH/PS/CMD scripts to Linux/Windows dpeloyments. Runs on Any Faas Provider
  //#   - Supports UN/PS and SSH KEY Auth For Linux and UN/PS for Windows . 
  //#   - Scripts can be stored in the action and run agains all machine resources or we can execute 
  //#     different script on each machine . For the later the script is stored within the machine
  //#     resource within the blueprint. Combination of both i possible. If both are present. Run 
  //#     order is as follows:
  //#      - 1st script to run is the one defined cmdActionPreOneScriptIn
  //#      - 2st script to run is the one defined in the Blueprint 
  //#      - 3st script to run is the one defined cmdActionPostOneScriptIn
  //#   - Because the IP address returned by Assembly is a private IP, when running agians dpeloyments 
  //#     from public providers , the following is required:
  //#      - AWS Deployments: The function has to be connected to the VMC where deployments are running. 
  //#        Port SSH/PS ports have to be connected to the security group. This has to be done for all 
  //#        regions where the function runs. 
  //#      - Azure Deployuments: Same as with AWS the App Function needs to be integrated with all 
  //#        Azure Virtual Networks where dpeloyment will be provisioned.
  //#        Ref: https://docs.microsoft.com/en-us/azure/azure-functions/functions-create-vnet
  //#   - Further guidance can be found here: ABX Action to Run Scripts on Cloud Assembly Deployments 
  //#     http://kaloferov.com/blog/skkb1054
  //# [Inputs]
  //#   - psUserIn (String): Windows Username
  //#   - sshUserIn (String): Linux Username
  //#   - cmdHostABXIn (String): IP Address for test purposes from within ABX
  //#   - actionOptionSshAuthIn (String): Authentication method
  //#      - key: Uses Username and SSH key
  //#      - password: Uses Username and Password
  //#         - psPassIn (String): Windows Password
  //#         - sshPassIn (String): Linux Password
  //#   - cmdDefaultShellTypeIn (String): Default script type. Used if one not definied in the Blueprint
  //#      - linux (String): Linux shell script. 
  //#      - pwoershell (String): Powershell/CMD shell script. 
  //#   - cmdActionPreOneDelayIn (String): Delay in Seconds before the FIRST PRE ABX Action is started. 
  //#   - cmdActionPostOneDelayIn (String): Delay in Seconds before the FIST POST ABX Action is started. 
  //#   - cmdActionPreOneScriptIn (String): First Pre script. Will be run before any Blueprint scripts. 
  //#   - cmdActionPostOneScriptIn (String): First Post script. Will be run after any Blueprint scripts. 
  //#   - actionOptionAllowBlueprintScriptsIn (Boolean): Wherever to allow Blueprint script to execute
  //#      - true: Allows Blueprint script to execute. Script will run after cmdActionPreOneScriptIn
  //#        and before the cmdActionPostOneScriptIn script. 
  //#      - false: Blueprint scirpt will not be run. 
  //# [Outputs]
  //# [Dependency]
  //#   - Requires: simple-ssh, nodejs-winrm
  //#    {
  //#     "dependencies": {
  //#       "simple-ssh": "1.0.0", 
  //#       "nodejs-winrm": "1.1.2"
  //#     }
  //#    }
  //# [FaaS]
  //#   - Any
  //# [Subscription]
  //#   - Event Topics:
  //#      - compute.provision.post
  //# [Bluepirnt]
  //#   - Properties (machine resource)
  //#      - abxRunScript_script: Command to execute. E.g.: mkdir bp-dir
  //#      - abxRunScript_delay: TIme delay in seconds before the script is run : E.g. (1m): 60
  //#      - abxRunScript_shellType: Type of the script. E.g.: shell (Linux) , powershell (Windows)
  //# [Thanks]
  //#   - My friend and college Kaloyan Kolev (https://www.linkedin.com/in/kaloyan-kolev)


// ----- Import Modules ----- // 

const fs = require('fs');
const SSH = require('simple-ssh');
const winrm = require('nodejs-winrm');

// ----- Global ----- //

// ----- Functions  ----- //


exports.handler = function handler(context, inputs) {
    var fn = "handler -";    // Holds the funciton name. 
    //console.log("[ABX] "+fn+" Action started.");
    //console.log("[ABX] "+fn+" Function started.");
    
    
    // ----- Action Options ----- //
    
    
    // General action options   
    var actionOptionAllowBlueprintScripts = inputs.actionOptionAllowBlueprintScriptsIn.toLowerCase() ;
    var actionOptionSshAuth = inputs.actionOptionSshAuthIn.toLowerCase() ;      // SSH Auth method: password or key
    
    
    // ----- Inputs ----- //


    var cmdActionPreOneScript = inputs.cmdActionPreOneScriptIn;   // Command Pre #1 Script
    var cmdActionPreOneDelay = inputs.cmdActionPreOneDelayIn;     // Command Pre #1 Delay
    var cmdActionPostOneScript = inputs.cmdActionPostOneScriptIn;   // Command Post #1 Script
    var cmdActionPostOneDelay = inputs.cmdActionPostOneDelayIn;     // Command Post #1 Delay
    var cmdBpScript = "";       // Blueprint Script Command
    var cmdBpDelay = 0;     // Blueprint Script Delay
    var cmdShellType = inputs.cmdDefaultShellTypeIn.toLowerCase();     // Shell Type : shell (Linux) or powershell (Windows)

    var cmdHost = inputs.cmdHostABXIn.toString();   // Host on which to execute the command
    
    var pshUser = inputs.psUserIn;     // PS Username
    var pshPass = inputs.psPassIn;     // PS Password
    var psPort = 5985;     // PS Winrm Port 

    var ssh = "";   // ssh construct for SSH Only
    var sshUser = inputs.sshUserIn;     // SSH Username
    var sshPass = inputs.sshPassIn;     // SSH Password
    var sshKey = `-----BEGIN RSA PRIVATE KEY-----
myRsaKeymyRsaKeymyRsaKeymyRsaKeymyRsaKeymyRsaKeymyRsaKeymyRsaKey
myRsaKeymyRsaKeymyRsaKeymyRsaKeymyRsaKeymyRsaKeymyRsaKeymyRsaKey
myRsaKeymyRsaKeymyRsaKeymyRsaKeymyRsaKeymyRsaKeymyRsaKeymyRsaKey
myRsaKeymyRsaKeymyRsaKeymyRsaKeymyRsaKeymyRsaKeymyRsaKeymyRsaKey
-----END RSA PRIVATE KEY-----`;

    function getSafe(fn, defaultVal) {  // Function to savely check if parameter/object exists
        try {
            return fn();
        } catch (e) {
            return defaultVal;
        }
    } // End Function

    
    if (inputs.customProperties !== undefined) {    // Loop to get inputs
    
        console.log("[ABX] "+fn+" Using Blueprint Inputs.");
        cmdHost = inputs.addresses[0].toString();
        
        if ( (getSafe(() => inputs.customProperties.abxRunScript_script) !== undefined) && (getSafe(() => inputs.customProperties.abxRunScript_delay) !== undefined)  && (getSafe(() => inputs.customProperties.abxRunScript_shellType) !== undefined) ) {     // Check If custom prop(s) exits and get calue
            
            cmdBpScript = inputs.customProperties.abxRunScript_script;      
            cmdBpDelay = inputs.customProperties.abxRunScript_delay;
            cmdShellType = inputs.customProperties.abxRunScript_shellType;
            
        } else {
            // Use default/action Inputs 
        } // End Loop
        
        
    } else {
        console.log("[ABX] "+fn+" Using Action Inputs (*ABXIn).");
        // Use default/action Inputs 
        
    } // End Loop
    
    
    console.log("[ABX] "+fn+" cmdHost: "+cmdHost); 
    console.log("[ABX] "+fn+" cmdShellType: "+cmdShellType); 
    console.log("[ABX] "+fn+" cmdBpScript: "+cmdBpScript); 
    console.log("[ABX] "+fn+" cmdBpDelay: "+cmdBpDelay); 
    console.log("[ABX] "+fn+" cmdActionPreOneScript: "+cmdActionPreOneScript);  
    console.log("[ABX] "+fn+" cmdActionPreOneDelay: "+cmdActionPreOneDelay);  
    console.log("[ABX] "+fn+" cmdActionPostOneScript: "+cmdActionPostOneScript);    
    console.log("[ABX] "+fn+" cmdActionPostOneDelay: "+cmdActionPostOneDelay);
    
    
    // ----- Script ----- //


    function sleep(time, callback) {    // Sleep funciton
        var stop = new Date().getTime();
        while(new Date().getTime() < stop + time) {
        }
        callback();
    } // End Function 



    if (cmdShellType == "linux".toLowerCase()){       // Loop to check if SHELL or POWESHELL will be run


        if (actionOptionSshAuth == "password".toLowerCase()) {      // Loop to select ssh Auth Method
        
            console.log("[ABX] "+fn+" actionOptionSshAuth: "+actionOptionSshAuth);        
            ssh = new SSH({
                host: cmdHost,
                user: sshUser,
                pass: sshPass
                //key: sshKey
            });
    
        } else if (actionOptionSshAuth == "key".toLowerCase())  {
            
            console.log("[ABX] "+fn+" actionOptionSshAuth: "+actionOptionSshAuth);        
            ssh = new SSH({
                host: cmdHost,
                user: sshUser,
                //pass: sshPass
                key: sshKey
            });
    
        } else {
            console.log("[ABX] "+fn+" actionOptionSshAuth: ERROR ");
        } // End Loop
    
    
        var ssh_resp = "";
        
        let sshRun = new Promise(function(resolve, reject) {
    
            sleep(cmdActionPreOneDelay*1000, function() {});      // Script One Sleep Timer
            console.log("[ABX] "+fn+" Running Action Script cmdActionOne...");    
            
            ssh.exec(cmdActionPreOneScript, {      // Script One Execute
                out: function(stdout) {
                    console.log(stdout);
                    ssh_resp += stdout;
                    //process.stdout.write(stdout);
                }
            }).start();


            if ((actionOptionAllowBlueprintScripts == "true".toLowerCase()) && (inputs.customProperties !== undefined) ) {      // Loop to check if BP Script is allowed and run it
            
                console.log("[ABX] "+fn+" Running Blueprint Script cmdBpScript (based on actionOptionAllowBlueprintScripts value of: "+actionOptionAllowBlueprintScripts+")...");    
                sleep(cmdBpDelay*1000, function() {});      // Sleep 
                
                ssh.exec(cmdBpScript, {     // Execute Script
                    out: function(stdout) {
                        console.log(stdout);
                        ssh_resp += stdout;
                        //process.stdout.write(stdout);
                    }
                }).start();
            
            } else {
                console.log("[ABX] "+fn+" NOT Running Blueprint Script cmdBpScript (based on actionOptionAllowBlueprintScripts value of: "+actionOptionAllowBlueprintScripts+")...");
                // No Bplueprint scripts defined to run 
            }// End Loop          
            

            sleep(cmdActionPostOneDelay*1000, function() {});       // Script Two Sleep Timer
            console.log("[ABX] "+fn+" Running Action Script cmdActionTwo...");
            
            ssh.exec(cmdActionPostOneScript, {      // Script Two Execute
                out: function(stdout) {
                    console.log(stdout);
                    ssh_resp += stdout;
                    //process.stdout.write(stdout);
                }
            }).start();
            
            
        }); // End Promise 


    } else if (cmdShellType == "windows".toLowerCase()){
        
        console.log("[ABX] "+fn+" Running Action Script cmdActionOne...");  
        sleep(cmdActionPreOneDelay*1000, function() {});       // Script One Delay
        winrm.runCommand(cmdActionPreOneScript , cmdHost , psUser , psPass , psPort);       // Script One Run
        
        if ((actionOptionAllowBlueprintScripts == "true".toLowerCase()) && (inputs.customProperties !== undefined) ) {      // Loop to check if BP Script is allowed and run it
        
            console.log("[ABX] "+fn+" Running Blueprint Script cmdBpScript (based on actionOptionAllowBlueprintScripts value of: "+actionOptionAllowBlueprintScripts+")...");    
            sleep(cmdBpDelay*1000, function() {});      // Script Blueprint Delay
            winrm.runCommand(cmdBpScript , cmdHost , pshUser , psPass , psPort);      // Script Bluerpint Run 
        
        } else {
            console.log("[ABX] "+fn+" NOT Running Blueprint Script cmdBpScript (based on actionOptionAllowBlueprintScripts value of: "+actionOptionAllowBlueprintScripts+")...");
            // No Bplueprint scripts defined to run 
        }// End Loop           
      
        console.log("[ABX] "+fn+" Running Action Script cmdActionTwo...");  
        sleep(cmdActionPostOneDelay*1000, function() {});       // Script Two Delay
        winrm.runCommand(cmdActionPostOneScript , cmdHost , psUser , psPass , psPort);       // Script Two Run
        
    } else {
        console.log("[ABX] "+fn+" ERROR - Undefinied cmdBpShellType: "+cmdBpShellType);
    }


    // ----- Outputs ----- //
    
    let outputs = {
        "SpasIsAwesome": "HeReallyIs"
    };      
    //console.log("[ABX] "+fn+" Function completed.");
    //console.log("[ABX] "+fn+" Action completed.");  
 
    
    return outputs;
  
}  // End Function 





