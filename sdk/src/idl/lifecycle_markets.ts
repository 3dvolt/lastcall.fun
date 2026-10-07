/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/lifecycle_markets.json`.
 */
export type LifecycleMarkets = {
  "address": "2oLfv3LDx7bDCzbnkzuvmT13s6xrxWawJr97NcGmKwLJ",
  "metadata": {
    "name": "lifecycleMarkets",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "Binary prediction markets on the lifecycle of newly launched tokens (DEVNET DEMO)"
  },
  "instructions": [
    {
      "name": "buy",
      "discriminator": [
        102,
        6,
        61,
        18,
        1,
        218,
        235,
        234
      ],
      "accounts": [
        {
          "name": "user",
          "writable": true,
          "signer": true
        },
        {
          "name": "market",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "market.creator",
                "account": "market"
              },
              {
                "kind": "account",
                "path": "market.marketId",
                "account": "market"
              }
            ]
          }
        },
        {
          "name": "position",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  115,
                  105,
                  116,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "market"
              },
              {
                "kind": "account",
                "path": "user"
              }
            ]
          }
        },
        {
          "name": "userCollateral",
          "writable": true
        },
        {
          "name": "vault",
          "writable": true
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "side",
          "type": {
            "defined": {
              "name": "side"
            }
          }
        },
        {
          "name": "collateralIn",
          "type": "u64"
        },
        {
          "name": "minSharesOut",
          "type": "u64"
        }
      ]
    },
    {
      "name": "claimResidual",
      "discriminator": [
        76,
        79,
        217,
        103,
        49,
        27,
        160,
        239
      ],
      "accounts": [
        {
          "name": "creator",
          "signer": true,
          "relations": [
            "market"
          ]
        },
        {
          "name": "market",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "market.creator",
                "account": "market"
              },
              {
                "kind": "account",
                "path": "market.marketId",
                "account": "market"
              }
            ]
          }
        },
        {
          "name": "creatorCollateral",
          "writable": true
        },
        {
          "name": "vault",
          "writable": true
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": []
    },
    {
      "name": "createMarket",
      "discriminator": [
        103,
        226,
        97,
        235,
        200,
        188,
        251,
        254
      ],
      "accounts": [
        {
          "name": "creator",
          "writable": true,
          "signer": true
        },
        {
          "name": "market",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "creator"
              },
              {
                "kind": "arg",
                "path": "marketId"
              }
            ]
          }
        },
        {
          "name": "collateralMint"
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "market"
              }
            ]
          }
        },
        {
          "name": "creatorCollateral",
          "writable": true
        },
        {
          "name": "resolver"
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "marketId",
          "type": "u64"
        },
        {
          "name": "tokenRef",
          "type": "pubkey"
        },
        {
          "name": "threshold",
          "type": "u64"
        },
        {
          "name": "expiryTs",
          "type": "i64"
        },
        {
          "name": "resolutionWindowSecs",
          "type": "u32"
        },
        {
          "name": "initialLiquidity",
          "type": "u64"
        },
        {
          "name": "feeBps",
          "type": "u16"
        }
      ]
    },
    {
      "name": "demoSetFeed",
      "docs": [
        "DEMO ONLY: writes the mock price feed. Centralized by design."
      ],
      "discriminator": [
        49,
        104,
        75,
        250,
        231,
        24,
        48,
        38
      ],
      "accounts": [
        {
          "name": "authority",
          "writable": true,
          "signer": true
        },
        {
          "name": "feed",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  102,
                  101,
                  101,
                  100
                ]
              },
              {
                "kind": "arg",
                "path": "tokenRef"
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "tokenRef",
          "type": "pubkey"
        },
        {
          "name": "price",
          "type": "u64"
        },
        {
          "name": "circulatingSupply",
          "type": "u64"
        },
        {
          "name": "liquidityUsd",
          "type": "u64"
        }
      ]
    },
    {
      "name": "redeem",
      "discriminator": [
        184,
        12,
        86,
        149,
        70,
        196,
        97,
        225
      ],
      "accounts": [
        {
          "name": "user",
          "signer": true,
          "relations": [
            "position"
          ]
        },
        {
          "name": "market",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "market.creator",
                "account": "market"
              },
              {
                "kind": "account",
                "path": "market.marketId",
                "account": "market"
              }
            ]
          },
          "relations": [
            "position"
          ]
        },
        {
          "name": "position",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  115,
                  105,
                  116,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "market"
              },
              {
                "kind": "account",
                "path": "user"
              }
            ]
          }
        },
        {
          "name": "userCollateral",
          "writable": true
        },
        {
          "name": "vault",
          "writable": true
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": []
    },
    {
      "name": "resolve",
      "discriminator": [
        246,
        150,
        236,
        206,
        108,
        63,
        58,
        10
      ],
      "accounts": [
        {
          "name": "resolver",
          "signer": true,
          "relations": [
            "market"
          ]
        },
        {
          "name": "market",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "market.creator",
                "account": "market"
              },
              {
                "kind": "account",
                "path": "market.marketId",
                "account": "market"
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "outcome",
          "type": {
            "defined": {
              "name": "outcome"
            }
          }
        },
        {
          "name": "evidenceHash",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        }
      ]
    },
    {
      "name": "sell",
      "discriminator": [
        51,
        230,
        133,
        164,
        1,
        127,
        131,
        173
      ],
      "accounts": [
        {
          "name": "user",
          "signer": true,
          "relations": [
            "position"
          ]
        },
        {
          "name": "market",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "market.creator",
                "account": "market"
              },
              {
                "kind": "account",
                "path": "market.marketId",
                "account": "market"
              }
            ]
          },
          "relations": [
            "position"
          ]
        },
        {
          "name": "position",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  115,
                  105,
                  116,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "market"
              },
              {
                "kind": "account",
                "path": "user"
              }
            ]
          }
        },
        {
          "name": "userCollateral",
          "writable": true
        },
        {
          "name": "vault",
          "writable": true
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": [
        {
          "name": "side",
          "type": {
            "defined": {
              "name": "side"
            }
          }
        },
        {
          "name": "sharesIn",
          "type": "u64"
        },
        {
          "name": "minCollateralOut",
          "type": "u64"
        }
      ]
    }
  ],
  "accounts": [
    {
      "name": "demoFeed",
      "discriminator": [
        164,
        123,
        201,
        88,
        3,
        183,
        220,
        212
      ]
    },
    {
      "name": "market",
      "discriminator": [
        219,
        190,
        213,
        55,
        0,
        227,
        198,
        154
      ]
    },
    {
      "name": "position",
      "discriminator": [
        170,
        188,
        143,
        228,
        122,
        64,
        247,
        208
      ]
    }
  ],
  "events": [
    {
      "name": "feedUpdated",
      "discriminator": [
        200,
        60,
        190,
        86,
        247,
        9,
        50,
        81
      ]
    },
    {
      "name": "marketCreated",
      "discriminator": [
        88,
        184,
        130,
        231,
        226,
        84,
        6,
        58
      ]
    },
    {
      "name": "redeemed",
      "discriminator": [
        14,
        29,
        183,
        71,
        31,
        165,
        107,
        38
      ]
    },
    {
      "name": "residualClaimed",
      "discriminator": [
        178,
        43,
        165,
        81,
        233,
        119,
        35,
        149
      ]
    },
    {
      "name": "resolved",
      "discriminator": [
        148,
        46,
        187,
        66,
        35,
        1,
        255,
        147
      ]
    },
    {
      "name": "trade",
      "discriminator": [
        24,
        254,
        218,
        152,
        253,
        43,
        18,
        81
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "mathOverflow",
      "msg": "Math overflow or invalid arithmetic"
    },
    {
      "code": 6001,
      "name": "zeroAmount",
      "msg": "Amount must be greater than zero"
    },
    {
      "code": 6002,
      "name": "reserveTooLarge",
      "msg": "Reserve would exceed the supported maximum"
    },
    {
      "code": 6003,
      "name": "insufficientReserve",
      "msg": "Pool reserve too small for this operation"
    },
    {
      "code": 6004,
      "name": "invariantViolated",
      "msg": "Pool invariant would be violated"
    },
    {
      "code": 6005,
      "name": "slippageExceeded",
      "msg": "Slippage limit exceeded"
    },
    {
      "code": 6006,
      "name": "marketNotOpen",
      "msg": "Market is not open"
    },
    {
      "code": 6007,
      "name": "tradingClosed",
      "msg": "Trading is closed: market expired"
    },
    {
      "code": 6008,
      "name": "notExpired",
      "msg": "Market has not expired yet"
    },
    {
      "code": 6009,
      "name": "notResolved",
      "msg": "Market is not resolved"
    },
    {
      "code": 6010,
      "name": "unauthorizedResolver",
      "msg": "Signer is not the market resolver"
    },
    {
      "code": 6011,
      "name": "unauthorizedCreator",
      "msg": "Signer is not the market creator"
    },
    {
      "code": 6012,
      "name": "unauthorizedFeedAuthority",
      "msg": "Signer is not the feed authority"
    },
    {
      "code": 6013,
      "name": "invalidExpiry",
      "msg": "Expiry must be in the future"
    },
    {
      "code": 6014,
      "name": "invalidParameter",
      "msg": "Invalid parameter"
    },
    {
      "code": 6015,
      "name": "feeTooHigh",
      "msg": "Fee too high"
    },
    {
      "code": 6016,
      "name": "alreadyRedeemed",
      "msg": "Position already redeemed"
    },
    {
      "code": 6017,
      "name": "alreadyClaimed",
      "msg": "Residual already claimed"
    },
    {
      "code": 6018,
      "name": "insufficientShares",
      "msg": "Not enough shares"
    },
    {
      "code": 6019,
      "name": "accountMismatch",
      "msg": "Account does not match market"
    },
    {
      "code": 6020,
      "name": "invalidCollateralMint",
      "msg": "Collateral mint must not have a freeze authority"
    }
  ],
  "types": [
    {
      "name": "demoFeed",
      "docs": [
        "PDA [\"feed\", token_ref]. DEMO ONLY: centralized mock price feed."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "tokenRef",
            "type": "pubkey"
          },
          {
            "name": "price",
            "docs": [
              "USD price, 6 decimals."
            ],
            "type": "u64"
          },
          {
            "name": "circulatingSupply",
            "docs": [
              "Circulating supply in WHOLE tokens (decimals already applied). market_cap_usd6 = price * circulating_supply."
            ],
            "type": "u64"
          },
          {
            "name": "liquidityUsd",
            "docs": [
              "USD liquidity, 6 decimals."
            ],
            "type": "u64"
          },
          {
            "name": "updatedTs",
            "type": "i64"
          },
          {
            "name": "authority",
            "type": "pubkey"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "feedUpdated",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "tokenRef",
            "type": "pubkey"
          },
          {
            "name": "price",
            "type": "u64"
          },
          {
            "name": "circulatingSupply",
            "type": "u64"
          },
          {
            "name": "liquidityUsd",
            "type": "u64"
          },
          {
            "name": "ts",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "market",
      "docs": [
        "PDA [\"market\", creator, market_id (u64 LE)]"
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "creator",
            "type": "pubkey"
          },
          {
            "name": "marketId",
            "type": "u64"
          },
          {
            "name": "collateralMint",
            "type": "pubkey"
          },
          {
            "name": "vault",
            "docs": [
              "Token account PDA [\"vault\", market]; its owner is the market PDA."
            ],
            "type": "pubkey"
          },
          {
            "name": "tokenRef",
            "docs": [
              "Pubkey of the tracked token (opaque identifier; used as DemoFeed key)."
            ],
            "type": "pubkey"
          },
          {
            "name": "threshold",
            "docs": [
              "Market cap threshold in USD, 6 decimals."
            ],
            "type": "u64"
          },
          {
            "name": "expiryTs",
            "type": "i64"
          },
          {
            "name": "resolutionWindowSecs",
            "docs": [
              "Length (seconds) of the sampling window the resolver must evaluate, ending at expiry_ts."
            ],
            "type": "u32"
          },
          {
            "name": "resolver",
            "type": "pubkey"
          },
          {
            "name": "status",
            "type": {
              "defined": {
                "name": "marketStatus"
              }
            }
          },
          {
            "name": "yesReserve",
            "type": "u64"
          },
          {
            "name": "noReserve",
            "type": "u64"
          },
          {
            "name": "totalMinted",
            "docs": [
              "Complete sets minted. Invariant: vault balance == total_minted + fees_accrued - redeemed/claimed payouts."
            ],
            "type": "u64"
          },
          {
            "name": "feeBps",
            "type": "u16"
          },
          {
            "name": "feesAccrued",
            "docs": [
              "Fees collected (stay in the vault, belong to the creator)."
            ],
            "type": "u64"
          },
          {
            "name": "evidenceHash",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "voidYesPrice",
            "docs": [
              "Void only: redemption price per share, scaled by PRICE_SCALE (1e9)."
            ],
            "type": "u64"
          },
          {
            "name": "voidNoPrice",
            "type": "u64"
          },
          {
            "name": "userObligation",
            "docs": [
              "Set at resolution: max collateral users can still redeem (excludes creator residual)."
            ],
            "type": "u64"
          },
          {
            "name": "residualClaimed",
            "type": "bool"
          },
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "vaultBump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "marketCreated",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "market",
            "type": "pubkey"
          },
          {
            "name": "creator",
            "type": "pubkey"
          },
          {
            "name": "marketId",
            "type": "u64"
          },
          {
            "name": "tokenRef",
            "type": "pubkey"
          },
          {
            "name": "threshold",
            "type": "u64"
          },
          {
            "name": "expiryTs",
            "type": "i64"
          },
          {
            "name": "resolutionWindowSecs",
            "type": "u32"
          },
          {
            "name": "resolver",
            "type": "pubkey"
          },
          {
            "name": "initialLiquidity",
            "type": "u64"
          },
          {
            "name": "feeBps",
            "type": "u16"
          }
        ]
      }
    },
    {
      "name": "marketStatus",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "open"
          },
          {
            "name": "resolvedYes"
          },
          {
            "name": "resolvedNo"
          },
          {
            "name": "void"
          }
        ]
      }
    },
    {
      "name": "outcome",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "yes"
          },
          {
            "name": "no"
          },
          {
            "name": "void"
          }
        ]
      }
    },
    {
      "name": "position",
      "docs": [
        "PDA [\"position\", market, user]"
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "market",
            "type": "pubkey"
          },
          {
            "name": "user",
            "type": "pubkey"
          },
          {
            "name": "yesShares",
            "type": "u64"
          },
          {
            "name": "noShares",
            "type": "u64"
          },
          {
            "name": "redeemed",
            "type": "bool"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "redeemed",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "market",
            "type": "pubkey"
          },
          {
            "name": "user",
            "type": "pubkey"
          },
          {
            "name": "yesShares",
            "type": "u64"
          },
          {
            "name": "noShares",
            "type": "u64"
          },
          {
            "name": "payout",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "residualClaimed",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "market",
            "type": "pubkey"
          },
          {
            "name": "creator",
            "type": "pubkey"
          },
          {
            "name": "amount",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "resolved",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "market",
            "type": "pubkey"
          },
          {
            "name": "outcome",
            "type": {
              "defined": {
                "name": "outcome"
              }
            }
          },
          {
            "name": "evidenceHash",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "yesReserve",
            "type": "u64"
          },
          {
            "name": "noReserve",
            "type": "u64"
          },
          {
            "name": "userObligation",
            "type": "u64"
          },
          {
            "name": "ts",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "side",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "yes"
          },
          {
            "name": "no"
          }
        ]
      }
    },
    {
      "name": "trade",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "market",
            "type": "pubkey"
          },
          {
            "name": "user",
            "type": "pubkey"
          },
          {
            "name": "side",
            "type": {
              "defined": {
                "name": "side"
              }
            }
          },
          {
            "name": "isBuy",
            "docs": [
              "true = buy, false = sell"
            ],
            "type": "bool"
          },
          {
            "name": "collateral",
            "docs": [
              "Collateral paid in (buy, gross incl. fee) or paid out (sell, net of fee)."
            ],
            "type": "u64"
          },
          {
            "name": "shares",
            "type": "u64"
          },
          {
            "name": "fee",
            "type": "u64"
          },
          {
            "name": "yesReserve",
            "type": "u64"
          },
          {
            "name": "noReserve",
            "type": "u64"
          },
          {
            "name": "ts",
            "type": "i64"
          }
        ]
      }
    }
  ],
  "constants": [
    {
      "name": "feedSeed",
      "type": "bytes",
      "value": "[102, 101, 101, 100]"
    },
    {
      "name": "marketSeed",
      "type": "bytes",
      "value": "[109, 97, 114, 107, 101, 116]"
    },
    {
      "name": "positionSeed",
      "type": "bytes",
      "value": "[112, 111, 115, 105, 116, 105, 111, 110]"
    },
    {
      "name": "vaultSeed",
      "type": "bytes",
      "value": "[118, 97, 117, 108, 116]"
    }
  ]
};
