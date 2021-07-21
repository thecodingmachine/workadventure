{
  local env = std.extVar("env"),
  local namespace = env.DEPLOY_REF,
  local tag = namespace,
  local url = namespace+".test.workadventu.re",
  // develop branch does not use admin because of issue with SSL certificate of admin as of now.
  local adminUrl = if namespace == "master" || namespace == "develop" || std.startsWith(namespace, "admin") then "https://"+url else null,
  "$schema": "https://raw.githubusercontent.com/thecodingmachine/deeployer/master/deeployer.schema.json",
  "version": "1.0",
  "containers": {
     "back1": {
       "image": "thecodingmachine/workadventure-back:"+tag,
       "host": {
         "url": "api1-"+url,
         "containerPort": 8080
       },
       "ports": [8080, 50051],
       "env": {
         "SECRET_KEY": "tempSecretKeyNeedsToChange",
         "ADMIN_API_TOKEN": env.ADMIN_API_TOKEN,
         "JITSI_ISS": env.JITSI_ISS,
         "JITSI_URL": env.JITSI_URL,
         "SECRET_JITSI_KEY": env.SECRET_JITSI_KEY,
         "TURN_STATIC_AUTH_SECRET": env.TURN_STATIC_AUTH_SECRET,
         "REDIS_HOST": "redis",
       } + (if adminUrl != null then {
         "ADMIN_API_URL": adminUrl,
       } else {})
     },
     "back2": {
            "image": "thecodingmachine/workadventure-back:"+tag,
            "host": {
              "url": "api2-"+url,
              "containerPort": 8080
            },
            "ports": [8080, 50051],
            "env": {
              "SECRET_KEY": "tempSecretKeyNeedsToChange",
              "ADMIN_API_TOKEN": env.ADMIN_API_TOKEN,
              "JITSI_ISS": env.JITSI_ISS,
              "JITSI_URL": env.JITSI_URL,
              "SECRET_JITSI_KEY": env.SECRET_JITSI_KEY,
              "TURN_STATIC_AUTH_SECRET": env.TURN_STATIC_AUTH_SECRET,
              "REDIS_HOST": "redis",
            } + (if adminUrl != null then {
              "ADMIN_API_URL": adminUrl,
            } else {})
          },
     "pusher": {
            "replicas": 2,
            "image": "thecodingmachine/workadventure-pusher:"+tag,
            "host": {
              "url": "pusher-"+url,
            },
            "ports": [8080],
            "env": {
              "SECRET_KEY": "tempSecretKeyNeedsToChange",
              "ADMIN_API_TOKEN": env.ADMIN_API_TOKEN,
              "JITSI_ISS": env.JITSI_ISS,
              "JITSI_URL": env.JITSI_URL,
              "API_URL": "back1:50051,back2:50051",
              "SECRET_JITSI_KEY": env.SECRET_JITSI_KEY,
            } + (if adminUrl != null then {
              "ADMIN_API_URL": adminUrl,
            } else {})
          },
    "front": {
      "image": "thecodingmachine/workadventure-front:"+tag,
      "host": {
        "url": "play-"+url,
      },
      "ports": [80],
      "env": {
        "PUSHER_URL": "//pusher-"+url,
        "UPLOADER_URL": "//uploader-"+url,
        "ADMIN_URL": "//"+url,
        "JITSI_URL": env.JITSI_URL,
        "SECRET_JITSI_KEY": env.SECRET_JITSI_KEY,
        "TURN_SERVER": "turn:coturn.workadventu.re:443,turns:coturn.workadventu.re:443",
        "JITSI_PRIVATE_MODE": if env.SECRET_JITSI_KEY != '' then "true" else "false",
        "START_ROOM_URL": "/_/global/maps-"+url+"/Floor0/floor0.json"
        //"GA_TRACKING_ID": "UA-10196481-11"
      }
    },
    "uploader": {
           "image": "thecodingmachine/workadventure-uploader:"+tag,
           "host": {
             "url": "uploader-"+url,
             "containerPort": 8080
           },
           "ports": [8080],
           "env": {
           }
         },
    "maps": {
      "image": "thecodingmachine/workadventure-maps:"+tag,
      "host": {
        "url": "maps-"+url
      },
      "ports": [80]
    },
    "redis": {
      "image": "redis:6",
    }
  },
  "config": {
    k8sextension(k8sConf)::
        k8sConf + {
          back1+: {
            deployment+: {
              spec+: {
                template+: {
                  metadata+: {
                    annotations+: {
                      "prometheus.io/port": "8080",
                      "prometheus.io/scrape": "true"
                    }
                  }
                }
              }
            },
            ingress+: {
              spec+: {
                tls+: [{
                  hosts: ["api1-"+url],
                  secretName: "certificate-tls"
                }]
              }
            }
          },
          back2+: {
            deployment+: {
              spec+: {
                template+: {
                  metadata+: {
                    annotations+: {
                      "prometheus.io/port": "8080",
                      "prometheus.io/scrape": "true"
                    }
                  }
                }
              }
            },
            ingress+: {
              spec+: {
                tls+: [{
                  hosts: ["api2-"+url],
                  secretName: "certificate-tls"
                }]
              }
            }
          },
          pusher+: {
            deployment+: {
              spec+: {
                template+: {
                  metadata+: {
                    annotations+: {
                      "prometheus.io/port": "8080",
                      "prometheus.io/scrape": "true"
                    }
                  }
                }
              }
            },
            ingress+: {
              spec+: {
                tls+: [{
                  hosts: ["pusher-"+url],
                  secretName: "certificate-tls"
                }]
              }
             }
          },
          front+: {
            ingress+: {
              spec+: {
                tls+: [{
                  hosts: ["play-"+url],
                  secretName: "certificate-tls"
                }]
              }
             }
          },
          uploader+: {
            ingress+: {
              spec+: {
                tls+: [{
                  hosts: ["uploader-"+url],
                  secretName: "certificate-tls"
                }]
              }
             }
          },
          maps+: {
            ingress+: {
              spec+: {
                tls+: [{
                  hosts: ["maps-"+url],
                  secretName: "certificate-tls"
                }]
              }
             }
          },
        }
  }
}
