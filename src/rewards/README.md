

## Firestore structure

- rewards 
    - {chainId} // contains the current state of the rewards programs
        - rewardsLedger
            - {eventId} // contains events to be added to reward programs
        

- users
    - {userId} 
        - userRewards
            - {chainId} // all-time rewards
                - userTransactionFeeRewardsLedger
                    - {eventId}
                - userRewardPhases
                    - {Phase}
                - userAllTimeRewards
                    - userAllTimeTransactionFeeRewards
            

