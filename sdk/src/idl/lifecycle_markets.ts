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
          "name": "tokenMint"
        },
        {
          "name": "sourceAccount"
        },
        {
          "name": "sampleBuffer",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  97,
                  109,
                  112,
                  108,
                  101,
                  115
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
        },
        {
          "name": "sampleIntervalSecs",
          "type": "u32"
        },
        {
          "name": "minLiquidityUsd",
          "type": "u64"
        },
        {
          "name": "sourceKind",
          "type": {
            "defined": {
              "name": "sourceKind"
            }
          }
        },
        {
          "name": "oracleAuthority",
          "type": "pubkey"
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
      "name": "recordSample",
      "docs": [
        "Permissionless, only inside the final window: records the current price-source value into the slot for \"now\"."
      ],
      "discriminator": [
        73,
        103,
        147,
        255,
        82,
        182,
        168,
        34
      ],
      "accounts": [
        {
          "name": "recorder",
          "signer": true
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
            "sampleBuffer"
          ]
        },
        {
          "name": "sampleBuffer",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  97,
                  109,
                  112,
                  108,
                  101,
                  115
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
          "name": "instructions",
          "address": "Sysvar1nstructions1111111111111111111111111"
        }
      ],
      "args": []
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
      "docs": [
        "Permissionless after expiry: the outcome is computed on-chain from the recorded samples."
      ],
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
          "name": "caller",
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
          },
          "relations": [
            "sampleBuffer"
          ]
        },
        {
          "name": "sampleBuffer",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  97,
                  109,
                  112,
                  108,
                  101,
                  115
                ]
              },
              {
                "kind": "account",
                "path": "market"
              }
            ]
          }
        }
      ],
      "args": []
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
    },
    {
      "name": "sampleBuffer",
      "discriminator": [
        131,
        100,
        144,
        83,
        24,
        164,
        251,
        11
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
      "name": "sampleRecorded",
      "discriminator": [
        84,
        131,
        33,
        9,
        193,
        184,
        103,
        242
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
      "name": "unauthorizedCreator",
      "msg": "Signer is not the market creator"
    },
    {
      "code": 6011,
      "name": "unauthorizedFeedAuthority",
      "msg": "Signer is not the feed authority"
    },
    {
      "code": 6012,
      "name": "invalidExpiry",
      "msg": "Expiry must be in the future"
    },
    {
      "code": 6013,
      "name": "invalidParameter",
      "msg": "Invalid parameter"
    },
    {
      "code": 6014,
      "name": "feeTooHigh",
      "msg": "Fee too high"
    },
    {
      "code": 6015,
      "name": "alreadyRedeemed",
      "msg": "Position already redeemed"
    },
    {
      "code": 6016,
      "name": "alreadyClaimed",
      "msg": "Residual already claimed"
    },
    {
      "code": 6017,
      "name": "insufficientShares",
      "msg": "Not enough shares"
    },
    {
      "code": 6018,
      "name": "accountMismatch",
      "msg": "Account does not match market"
    },
    {
      "code": 6019,
      "name": "invalidCollateralMint",
      "msg": "Collateral mint must not have a freeze authority (USDC is the only exception)"
    },
    {
      "code": 6020,
      "name": "outsideWindow",
      "msg": "Sampling is only possible inside the final resolution window"
    },
    {
      "code": 6021,
      "name": "slotAlreadyFilled",
      "msg": "This sample slot is already filled"
    },
    {
      "code": 6022,
      "name": "staleFeed",
      "msg": "The price feed is stale or from the future"
    },
    {
      "code": 6023,
      "name": "invalidSampling",
      "msg": "Invalid sampling configuration"
    },
    {
      "code": 6024,
      "name": "invalidOracle",
      "msg": "Price source account is not the one registered for this market"
    },
    {
      "code": 6025,
      "name": "invalidSource",
      "msg": "Unsupported or invalid price source"
    },
    {
      "code": 6026,
      "name": "demoDisabled",
      "msg": "The demo price feed is disabled in this build"
    },
    {
      "code": 6027,
      "name": "notStandalone",
      "msg": "Samples must be recorded by a transaction that contains only this instruction"
    },
    {
      "code": 6028,
      "name": "unsafeToken",
      "msg": "The token's issuer can print supply or holds a Token-2022 power over the pool (mint authority, permanent delegate, transfer hook, pausable)"
    }
  ],
  "types": [
    {
      "name": "demoFeed",
      "docs": [
        "PDA [\"feed\", token_ref]. Price publisher account; written only by its authority."
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
              "Pubkey of the tracked token (opaque identifier; key of its DemoFeed)."
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
              "Length (seconds) of the final window that decides the outcome, ending at expiry_ts."
            ],
            "type": "u32"
          },
          {
            "name": "sampleIntervalSecs",
            "docs": [
              "Seconds per sample slot inside the window."
            ],
            "type": "u32"
          },
          {
            "name": "sampleSlots",
            "docs": [
              "Number of sample slots = ceil(window / interval), <= MAX_SLOTS."
            ],
            "type": "u16"
          },
          {
            "name": "minLiquidityUsd",
            "docs": [
              "Minimum median liquidity (USD, 6 decimals) in the window; below it the market is void."
            ],
            "type": "u64"
          },
          {
            "name": "oracleAuthority",
            "docs": [
              "DemoFeed source only: the publisher whose feed writes are accepted. Pubkey::default() for PumpSwap."
            ],
            "type": "pubkey"
          },
          {
            "name": "sourceKind",
            "type": {
              "defined": {
                "name": "sourceKind"
              }
            }
          },
          {
            "name": "sourcePool",
            "docs": [
              "PumpSwap: the pool account. DemoFeed: the feed PDA."
            ],
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
              "Complete sets minted. Invariant: vault balance == total_minted + fees_accrued - payouts."
            ],
            "type": "u64"
          },
          {
            "name": "feeBps",
            "type": "u16"
          },
          {
            "name": "feesAccrued",
            "type": "u64"
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
            "name": "resSamples",
            "type": "u16"
          },
          {
            "name": "resAbove",
            "type": "u16"
          },
          {
            "name": "resTwap",
            "type": "u64"
          },
          {
            "name": "resLiqMedian",
            "type": "u64"
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
            "name": "oracleAuthority",
            "type": "pubkey"
          },
          {
            "name": "sourceKind",
            "type": {
              "defined": {
                "name": "sourceKind"
              }
            }
          },
          {
            "name": "sourcePool",
            "type": "pubkey"
          },
          {
            "name": "sampleIntervalSecs",
            "type": "u32"
          },
          {
            "name": "sampleSlots",
            "type": "u16"
          },
          {
            "name": "minLiquidityUsd",
            "type": "u64"
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
            "name": "resolvedBy",
            "type": "pubkey"
          },
          {
            "name": "samples",
            "type": "u16"
          },
          {
            "name": "above",
            "type": "u16"
          },
          {
            "name": "twap",
            "type": "u64"
          },
          {
            "name": "liqMedian",
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
      "name": "sampleBuffer",
      "docs": [
        "PDA [\"samples\", market]. One slot per `sample_interval_secs` in the final window; first valid writer wins."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "market",
            "type": "pubkey"
          },
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "count",
            "type": "u16"
          },
          {
            "name": "mcap",
            "docs": [
              "market cap in USD (6 decimals) read from the feed when the slot was recorded"
            ],
            "type": {
              "array": [
                "u64",
                120
              ]
            }
          },
          {
            "name": "liquidity",
            "type": {
              "array": [
                "u64",
                120
              ]
            }
          },
          {
            "name": "filled",
            "type": {
              "array": [
                "bool",
                120
              ]
            }
          }
        ]
      }
    },
    {
      "name": "sampleRecorded",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "market",
            "type": "pubkey"
          },
          {
            "name": "slot",
            "type": "u16"
          },
          {
            "name": "marketCap",
            "type": "u64"
          },
          {
            "name": "liquidity",
            "type": "u64"
          },
          {
            "name": "ts",
            "type": "i64"
          },
          {
            "name": "recorder",
            "type": "pubkey"
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
      "name": "sourceKind",
      "docs": [
        "Where a market's price data comes from. Fixed at creation."
      ],
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "demoFeed"
          },
          {
            "name": "pumpSwap"
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
      "name": "samplesSeed",
      "type": "bytes",
      "value": "[115, 97, 109, 112, 108, 101, 115]"
    },
    {
      "name": "vaultSeed",
      "type": "bytes",
      "value": "[118, 97, 117, 108, 116]"
    }
  ]
};
